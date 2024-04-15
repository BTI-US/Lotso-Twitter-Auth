const express = require('express');
const https = require('https');
const fs = require('fs');
const { OAuth } = require('oauth');
const cors = require('cors');
const session = require('express-session');
const crypto = require('crypto');
const redis = require('redis');
const RedisStore = require('connect-redis').default;

const app = express();
app.set('trust proxy', 1); // Trust the first proxy

const redisClient = redis.createClient({
    // Specify Redis server settings if not default
    host: 'localhost',
    port: 6000,
});
redisClient.connect();
const sessionStore = new RedisStore({ client: redisClient });

redisClient.on('error', (err) => {
    console.log('Could not establish a connection with Redis. ', err);
});

redisClient.on('connect', (err) => {
    console.log('Connected to Redis successfully');
});

redisClient.on('end', () => {
    console.log('Redis client has disconnected from the server.');
});

redisClient.on('reconnecting', () => {
    console.log('Redis client is trying to reconnect to the server.');
});

redisClient.on('ready', () => {
    console.log('Redis client is ready to accept requests.');
});

redisClient.on('warning', (warning) => {
    console.log('Redis client received a warning:', warning);
});

redisClient.on('monitor', (time, args, source, database) => {
    console.log('Redis client is monitoring:', time, args, source, database);
});

redisClient.on('message', (channel, message) => {
    console.log('Redis client received a message:', channel, message);
});

if (!process.env.DOCKER_ENV) {
    require('dotenv').config();
}

// Only allow your specific frontend domain and enable credentials
const corsOptions = {
    origin(origin, callback) {
        callback(null, true);
    },
    credentials: true, // Enable credentials
    allowedHeaders: '*', // Accept any headers
    exposedHeaders: '*', // Expose any headers
};

app.use(cors(corsOptions));
app.use(session({
    store: sessionStore,
    secret: generateSecretKey(), // Generate a random secret key for the session
    resave: false,
    saveUninitialized: true,
    cookie: {
        path: '/',
        secure: true, // Set secure cookies based on the connection protocol
        httpOnly: true, // Protect against client-side scripting accessing the cookie
        maxAge: 3600000, // Set cookie expiration, etc.
        sameSite: 'None',
    },
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// TEST: Middleware to log session data for debugging
app.use((req, res, next) => {
    console.log("Session middleware check: Session ID is", req.sessionID);
    console.log("Session data:", req.session);
    next();
});

const { TWITTER_CONSUMER_KEY, TWITTER_CONSUMER_SECRET } = process.env;

app.get('/start-auth', (req, res) => {    
    const oauth = new OAuth(
        'https://api.twitter.com/oauth/request_token',
        'https://api.twitter.com/oauth/access_token',
        TWITTER_CONSUMER_KEY,
        TWITTER_CONSUMER_SECRET,
        '1.0A',
        'https://oauth.btiplatform.com/twitter-callback',
        'HMAC-SHA1',
    );

    const callbackUrl = decodeURIComponent(req.query.callback);
    oauth.getOAuthRequestToken({ oauth_callback: callbackUrl }, (error, oauthToken, oauthTokenSecret, results) => {
        if (error) {
            console.error('Failed to get OAuth request token:', error);
            res.status(500).json(error);
        } else {
            const url = `https://api.twitter.com/oauth/authenticate?oauth_token=${oauthToken}`;
            console.log('Redirecting user to Twitter authentication page');
            res.redirect(url);
        }
    });
});
app.options('/start-auth', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/twitter-callback', (req, res) => {
    const oauth = new OAuth(
        'https://api.twitter.com/oauth/request_token',
        'https://api.twitter.com/oauth/access_token',
        TWITTER_CONSUMER_KEY,
        TWITTER_CONSUMER_SECRET,
        '1.0A',
        'https://oauth.btiplatform.com/twitter-callback',
        'HMAC-SHA1',
    );

    const { oauth_token, oauth_verifier } = req.query;
    oauth.getOAuthAccessToken(
        oauth_token,
        null,
        oauth_verifier,
        (error, accessToken, accessTokenSecret, results) => {
            if (error) {
                console.error('Error getting OAuth access token:', error);
                res.status(500).json({ status: 'failure', error });
            } else {
                // Store tokens in the session
                req.session.accessToken = accessToken;
                req.session.accessTokenSecret = accessTokenSecret;
                // Set a secure cookie for the session ID
                res.cookie('session_id', req.sessionID, { httpOnly: true, secure: true, sameSite: 'None' });
                // Redirect to the frontend with a session identifier
                res.redirect('https://dev.lotso.org/auth-success.html');
            }
        },
    );
});

app.get('/check-auth-status', (req, res) => {
    // Assume the session ID is automatically managed through the cookie
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /check-auth-status");

    // Check if the session has the access token and token secret
    if (req.session.accessToken && req.session.accessTokenSecret) {
        res.json({ isAuthenticated: true });
    } else {
        res.status(401).json({ isAuthenticated: false });
    }
});
app.options('/check-auth-status', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/check-retweet', (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /check-retweet");

    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { tweetId } = req.query;

        // Fetch the user ID from the username first
        getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                checkIfRetweeted(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId)
                    .then(result => res.json(result))
                    .catch(error => res.status(500).json({
                        error: "Failed to check retweet status",
                        details: error,
                    }));
                })
                .catch(error => res.status(500).json({ error: error.message }));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/check-retweet', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/check-follow', (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /check-follow");

    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { username } = req.query; // Get the username from the query parameters

        // Fetch the user ID from the username first
        getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                // Now check if the user is followed using the fetched user ID
                checkIfFollowed(req.session.accessToken, req.session.accessTokenSecret, userId)
                    .then(result => res.json(result))
                    .catch(error => res.status(500).json({ error: error.toString() }));
            })
            .catch(error => res.status(500).json({ error: error.message }));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/check-follow', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/check-like', (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /check-like");

    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { userName, tweetId } = req.query;
        if (!userName || !tweetId) {
            return res.status(400).json({ error: 'Username and tweetId are required' });
        }

        // Get the current user's Twitter ID
        getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                // With the user ID, proceed to retweet the specified tweet
                checkIfLiked(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId)
                    .then(result => res.json(result))
                    .catch(error => res.status(500).json({ error: error.toString() }));
                })
                .catch(error => res.status(500).json({ error: error.toString() }));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/check-like', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/check-bookmark', (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /check-bookmark");

    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { tweetId } = req.query;

        // Fetch the user ID from the username first
        getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                checkIfBookmarked(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId)
                    .then(result => res.json(result))
                    .catch(error => res.status(500).json({
                        error: "Failed to check bookmark status",
                        details: error,
                    }));
                })
                .catch(error => res.status(500).json({ error: error.message }));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/check-bookmark', cors(corsOptions)); // Enable preflight request for this endpoint

function getUserTwitterId(accessToken, accessTokenSecret) {
    console.log("Access token:", accessToken);
    console.log("Access token secret:", accessTokenSecret);
    const oauth = new OAuth(
        'https://api.twitter.com/oauth/request_token',
        'https://api.twitter.com/oauth/access_token',
        process.env.TWITTER_CONSUMER_KEY,
        process.env.TWITTER_CONSUMER_SECRET,
        '1.0A',
        null,
        'HMAC-SHA1',
    );

    return new Promise((resolve, reject) => {
        const url = 'https://api.twitter.com/1.1/account/verify_credentials.json';
        oauth.get(
            url,
            accessToken,  // OAuth access token
            accessTokenSecret,  // OAuth access token secret
            (error, data, response) => {
                if (error) {
                    reject(error);
                } else {
                    try {
                        const parsedData = JSON.parse(data);
                        console.log("Parsed data:", parsedData);
                        resolve(parsedData.id_str);  // Returns the string version of the user's ID
                    } catch (parseError) {
                        console.error("Error parsing JSON:", parseError);
                        reject(parseError);
                    }
                }
            },
        );
    });
}

app.get('/retweet', (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /retweet");

    // TEST: print the request query parameters
    console.log("TEST: Query parameters:", req.query);

    if (req.session.accessToken && req.session.accessTokenSecret) {
        console.log("TEST: Access token and secret found");
        const { tweetId } = req.query;
        if (!tweetId) {
            console.log("tweetId not found");
            return res.status(400).json({ error: 'tweetId is required' });
        }

        // Get the current user's Twitter ID
        getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                console.log("Current User ID is:", userId);
                // With the user ID, proceed to retweet the specified tweet
                retweetTweet(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId)
                    .then(response => res.json(response))
                    .catch(error => res.status(500).json({ error: error.toString() }));
            })
            .catch(error => res.status(500).json({ error: error.toString() }));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/retweet', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/like', (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /like");

    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { tweetId } = req.query;
        if (!tweetId) {
            console.log("tweetId not found");
            return res.status(400).json({ error: 'tweetId is required' });
        }

        // Fetch the user ID from the username
        getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                // Use the userId to like the tweet
                likeTweet(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId)
                    .then(response => res.json(response))
                    .catch(error => res.status(500).json({ error: error.toString() }));
            })
            .catch(error => res.status(500).json({ error: error.toString() }));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/like', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/bookmark', (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /bookmark");

    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { tweetId } = req.query;
        if (!tweetId) {
            console.log("tweetId not found");
            return res.status(400).json({ error: 'tweetId is required' });
        }

        // Fetch the user ID from the username
        getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                // Use the userId to bookmark the tweet
                bookmarkTweet(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId)
                    .then(response => res.json(response))
                    .catch(error => res.status(500).json(error));
            })
            .catch(error => res.status(500).json({ error: error.toString() }));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/bookmark', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/follow-us', (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /follow-us");

    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { userName } = req.query;
        if (!userName) {
            console.log("tweetId not found");
            return res.status(400).json({ error: 'userName are required' });
        }

        // Fetch the user ID from the username
        getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                // Fetch the target user's ID from the username
                fetchUserId(userName, req.session.accessToken, req.session.accessTokenSecret)
                    .then(targetUserId => {
                        // Use the userId to follow the user
                        followUser(req.session.accessToken, req.session.accessTokenSecret, userId, targetUserId)
                            .then(response => res.json(response))
                            .catch(error => res.status(500).json({ error: error.message }));
                });
            })
            .catch(error => res.status(500).json({ error: error.message }));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/follow-us', cors(corsOptions)); // Enable preflight request for this endpoint

const PORT = process.env.PORT || 5000;
https.createServer({
    key: fs.readFileSync('/etc/letsencrypt/live/btiplatform.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/btiplatform.com/fullchain.pem'),
}, app)
.listen(PORT, () => {
    console.log(`Listening on port ${PORT}!`);
});

// Function to generate a secret key
function generateSecretKey(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * @brief Makes an authenticated request to a specified URL using OAuth.
 * @param {string} accessToken - The OAuth access token.
 * @param {string} accessTokenSecret - The OAuth access token secret.
 * @param {string} method - The HTTP method for the request (e.g., 'GET', 'POST').
 * @param {string} url - The URL to make the request to.
 * @param {Object|null} [body=null] - The request body for POST requests.
 * @return {Promise<Object>} A promise that resolves with the response data.
 * @note This function requires the 'OAuth' library to be installed.
 */
function makeAuthenticatedRequest(accessToken, accessTokenSecret, method, url, body = null) {
    console.log("TEST");
    return new Promise((resolve, reject) => {
        const oauth = new OAuth(
            'https://api.twitter.com/oauth/request_token',
            'https://api.twitter.com/oauth/access_token',
            process.env.TWITTER_CONSUMER_KEY,
            process.env.TWITTER_CONSUMER_SECRET,
            '1.0A',
            null,
            'HMAC-SHA1',
        );

        oauth[method.toLowerCase()](
            url,
            accessToken,  // OAuth access token
            accessTokenSecret,  // OAuth access token secret
            body,  // Post body for POST requests
            'application/json',  // Post content type
            (error, data, response) => {
                if (error) {
                    console.error("Error response:", error); // Log the full error
                    reject(error);
                } else {
                    console.log("Successful response data:", data);
                    console.log("Full response object:", response); // Log the full response object
                    try {
                        resolve(JSON.parse(data));
                    } catch (parseError) {
                        console.error("Error parsing JSON:", parseError);
                        reject(parseError);
                    }
                }
            },
        );
    });
}

/**
 * @brief Retweets a tweet using the provided access token and access token secret.
 * 
 * @param {string} accessToken - The access token for authenticating the request.
 * @param {string} accessTokenSecret - The access token secret for authenticating the request.
 * @param {string} userId - The ID of the authenticated user.
 * @param {string} tweetId - The ID of the tweet to retweet.
 * 
 * @return {Promise} A Promise that resolves with the response from the retweet API call.
 * 
 * @note This function makes an authenticated request to the Twitter API to retweet a specific tweet.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/tweets/retweets/api-reference/post-users-id-retweets
 * Limitation: 5 requests / 15 mins per user, no tweet cap
 */
function retweetTweet(accessToken, accessTokenSecret, userId, tweetId) {
    const url = `https://api.twitter.com/2/users/${userId}/retweets`;
    const body = JSON.stringify({ tweet_id: tweetId });

    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body)
        .then(response => {
            // Assuming makeAuthenticatedRequest resolves with the parsed JSON data
            if (response.errors) {
                // If Twitter API returns errors, handle them here
                const errorDetails = response.errors[0];
                console.error(`Failed to retweet tweet, Error: ${errorDetails.detail}`);
                throw new Error(`Failed to retweet tweet, Error: ${errorDetails.detail}`);
            }
            return response;  // If no errors, return the successful response
        })
        .catch(error => {
            console.error('Failed to retweet tweet:', error);
            throw error;  // Rethrow error to be handled by the caller
        });
}

/**
 * @brief Likes a tweet using the provided access tokens.
 * 
 * @param {string} accessToken - The access token for authenticating the request.
 * @param {string} accessTokenSecret - The access token secret for authenticating the request.
 * @param {string} userId - The ID of the authenticated user.
 * @param {string} tweetId - The ID of the tweet to be liked.
 * 
 * @return {Promise} A promise that resolves to the response of the API request.
 * 
 * @note This function makes an authenticated request to the Twitter API to like a tweet.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/tweets/likes/api-reference/post-users-id-likes
 * Limitation: 200 requests / 24 hours per user or 5 requests / 15 mins, no tweet cap
 */
function likeTweet(accessToken, accessTokenSecret, userId, tweetId) {
    const url = `https://api.twitter.com/2/users/${userId}/likes`;
    const body = JSON.stringify({ tweet_id: tweetId });
    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body)
        .then(response => {
            // Assuming makeAuthenticatedRequest resolves with the parsed JSON data
            if (response.errors) {
                // If Twitter API returns errors, handle them here
                const errorDetails = response.errors[0];
                console.error(`Failed to like tweet, Error: ${errorDetails.detail}`);
                throw new Error(`Failed to like tweet, Error: ${errorDetails.detail}`);
            }
            return response;  // If no errors, return the successful response
        })
        .catch(error => {
            console.error('Failed to like tweet:', error);
            throw error;  // Rethrow error to be handled by the caller
        });
}

/**
 * @brief Bookmarks a tweet using the provided access tokens.
 * 
 * @param {string} accessToken - The access token for authenticating the request.
 * @param {string} accessTokenSecret - The access token secret for authenticating the request.
 * @param {string} userId - The ID of the authenticated user.
 * @param {string} tweetId - The ID of the tweet to be bookmarked.
 * 
 * @return {Promise} A promise that resolves to the response of the API request.
 * 
 * @note This function makes an authenticated request to the Twitter API to bookmark a tweet.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/tweets/bookmarks/api-reference/get-users-id-bookmarks
 * Limitation: 5 requests / 15 mins per user, no tweet cap
 */
function bookmarkTweet(accessToken, accessTokenSecret, userId, tweetId) {
    const url = `https://api.twitter.com/2/users/${userId}/bookmarks`;
    const body = JSON.stringify({ tweet_id: tweetId });
    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body)
        .then(response => {
            // Assuming makeAuthenticatedRequest resolves with the parsed JSON data
            if (response.errors) {
                // If Twitter API returns errors, handle them here
                const errorDetails = response.errors[0];
                console.error(`Failed to bookmark tweet, Error: ${errorDetails.detail}`);
                throw new Error(`Failed to bookmark tweet, Error: ${errorDetails.detail}`);
            }
            return response;  // If no errors, return the successful response
        })
        .catch(error => {
            console.error('Failed to bookmark tweet:', error);
            throw error;  // Rethrow error to be handled by the caller
        });
}

/**
 * @brief Fetches the user ID for a given username using Twitter API.
 *
 * @param {string} username - The username of the user.
 * @param {string} accessToken - The access token for authentication.
 * @param {string} accessTokenSecret - The access token secret for authentication.
 * @return {Promise<string>} A promise that resolves to the user ID.
 * @throws {Error} If there is an error fetching the user ID.
 * @note This function makes an authenticated request to the Twitter API to fetch the user ID
 *       using the provided username, access token, and access token secret.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/users/lookup/api-reference/get-users-by-username-username
 * Limitation: 500 requests / 24 hours per app or 100 requests / 24 hours per user, no user cap
 */
function fetchUserId(username, accessToken, accessTokenSecret) {
    console.log("Fetching user ID for: ", username);
    const url = `https://api.twitter.com/2/users/by/username/${username}`;
    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url)
        .then(response => {
            console.log("Fetched user ID: ", response.data.id);
            return response.data.id;
        })
        .catch(error => {
            console.error('Failed to fetch user ID: ', error);
            throw new Error('Failed to fetch user ID');
        });
}

/**
 * @brief Follows a user on Twitter using the provided access tokens.
 * 
 * @param {string} accessToken - The access token for the authenticated user.
 * @param {string} accessTokenSecret - The access token secret for the authenticated user.
 * @param {string} userId - The ID of the authenticated user.
 * @param {string} targetUserId - The ID of the user to follow.
 * 
 * @return {Promise} A promise that resolves when the user has been followed successfully.
 * 
 * @note This function first obtains the current user's Twitter ID and then makes an authenticated
 * request to follow the specified user using the obtained ID.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/users/follows/api-reference/get-users-id-following
 * Limitation: 5 requests / 15 mins per user, no user cap
 */
function followUser(accessToken, accessTokenSecret, userId, targetUserId) {
    const url = `https://api.twitter.com/2/users/${userId}/following`;
    const body = JSON.stringify({ target_user_id: targetUserId });
    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body)
        .then(response => {
            // Directly use response as it is already a JSON object from makeAuthenticatedRequest
            if (response.errors) {
                // Check if there are any errors in the response JSON
                const errorDetails = response.errors[0];
                console.error(`Failed to follow user, Error: ${errorDetails.detail}`);
                throw new Error(`Failed to follow user, Error: ${errorDetails.detail}`);
            }
            return response; // Return the success response JSON
        })
        .catch(error => {
            console.error('Failed to follow user:', error);
            throw error;  // Rethrow error to be handled by the caller
        });
}

/**
 * @brief Checks if a tweet has been retweeted by the user.
 * 
 * @param {string} accessToken - The access token for authenticating the request.
 * @param {string} accessTokenSecret - The access token secret for authenticating the request.
 * @param {string} userId - The ID of the tweet to check for retweets.
 * @param {string} targetTweetId - The ID of the tweet to check if retweeted.
 * 
 * @return {Promise<{retweeted: boolean}>} - A promise that resolves to an object containing the retweeted status.
 * 
 * @note This function makes an authenticated request to the Twitter API to fetch the user's timeline tweets
 * and checks if any tweet is a retweet of the specified tweetId.
 * If an error occurs during the process, it will be logged and rethrown to be handled by the caller.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/tweets/timelines/api-reference/get-users-id-tweets
 */
function checkIfRetweeted(accessToken, accessTokenSecret, userId, targetTweetId) {
    // Twitter API endpoint to fetch user's timeline tweets
    const url = `https://api.twitter.com/2/users/${userId}/tweets?max_results=10`;

    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url)
        .then(response => {
            if (response.data && response.data.length > 0) {
                // Check through the list of followed users to see if targetTweetId is one of them
                const isLiked = response.data.some(tweet => tweet.id === targetTweetId);
                return { isLiked };
            } else {
                // If the data array is empty, the user is not following anyone or the specified userId is invalid
                return { isLiked: false };
            }
        })
        .catch(error => {
            console.error('Error checking if retweeted:', error);
            throw error;  // Rethrow error to be handled by the caller
        });
}

/**
 * @brief Checks if the authenticated user is following another user on Twitter.
 * 
 * @param {string} accessToken - The access token for the authenticated user.
 * @param {string} accessTokenSecret - The access token secret for the authenticated user.
 * @param {string} userId - The ID of the user to check if the authenticated user is following.
 * @param {string} targetUserId - The ID of the user to check if the authenticated user is following.
 * 
 * @return {Promise<{isFollowing: boolean}>} A promise that resolves to an object containing the following status.
 * @note This function makes an authenticated request to the Twitter API to check the relationship between the authenticated user and the target user.
 * If the authenticated user is following the target user, the promise resolves to { isFollowing: true }, otherwise it resolves to { isFollowing: false }.
 * If there is an error during the request, the promise is rejected with the error.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/users/follows/api-reference/get-users-id-following
 */
function checkIfFollowed(accessToken, accessTokenSecret, userId, targetUserId) {
    // Twitter API endpoint to check if the authenticated user is following another user
    const url = `https://api.twitter.com/2/users/${userId}/following`;

    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url)
        .then(response => {
            if (response.data && response.data.length > 0) {
                // Check through the list of followed users to see if targetUserId is one of them
                const isFollowing = response.data.some(user => user.id === targetUserId);
                return { isFollowing };
            } else {
                // If the data array is empty, the user is not following anyone or the specified userId is invalid
                return { isFollowing: false };
            }
        })
        .catch(error => {
            console.error('Error checking if followed:', error);
            throw error;  // Rethrow error to be handled by the caller
        });
}

/**
 * @brief Checks if a user has liked a specific tweet.
 * 
 * @param {string} accessToken - The access token for authenticating the request.
 * @param {string} accessTokenSecret - The access token secret for authenticating the request.
 * @param {string} userId - The ID of the user to check if liked the tweet.
 * @param {string} targetTweetId - The ID of the tweet to check if liked.
 * 
 * @return {Promise<{ hasLiked: boolean }>} - A promise that resolves to an object containing the result of the check.
 * @note This function makes an authenticated request to the Twitter API to fetch the user's liked tweets and checks if any of them match the specified tweetId.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/tweets/likes/api-reference/get-users-id-liked_tweets
 */
function checkIfLiked(accessToken, accessTokenSecret, userId, targetTweetId) {
    // Twitter API endpoint to fetch the user's likes
    const url = `https://api.twitter.com/2/users/${userId}/liked_tweets`;

    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url)
        .then(response => {
            if (response.data && response.data.length > 0) {
                // Check through the list of followed users to see if targetTweetId is one of them
                const isLiked = response.data.some(tweet => tweet.id === targetTweetId);
                return { isLiked };
            } else {
                // If the data array is empty, the user is not following anyone or the specified userId is invalid
                return { isLiked: false };
            }
        })
        .catch(error => {
            console.error('Error checking if liked:', error);
            throw error;
        });
}

/**
 * @brief Checks if a specific tweet is bookmarked by a user.
 * 
 * @param {string} accessToken - The access token for authenticating the request.
 * @param {string} accessTokenSecret - The access token secret for authenticating the request.
 * @param {string} userId - The ID of the user.
 * @param {string} targetTweetId - The ID of the tweet to check.
 * 
 * @return {Promise<{ isBookmarked: boolean }>} A promise that resolves to an object containing the `isBookmarked` property, indicating whether the tweet is bookmarked or not.
 * 
 * @note This function makes an authenticated request to the Twitter API to fetch the user's bookmarks and checks if the specified tweet ID is present in the list.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/tweets/bookmarks/api-reference/get-users-id-bookmarks
 * Limitation: 10 requests / 15 mins per user, no tweet cap
*/
function checkIfBookmarked(accessToken, accessTokenSecret, userId, targetTweetId) {
    // Twitter API endpoint to fetch the user's bookmarks
    const url = `https://api.twitter.com/2/users/${userId}/bookmarks`;

    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url)
        .then(response => {
            if (response.data && response.data.length > 0) {
                // Check through the list of followed users to see if targetTweetId is one of them
                const isBookmarked = response.data.some(tweet => tweet.id === targetTweetId);
                return { isBookmarked };
            } else {
                // If the data array is empty, the user is not following anyone or the specified userId is invalid
                return { isBookmarked: false };
            }
        })
        .catch(error => {
            console.error('Error checking if bookmarked:', error);
            throw error;
        });
}