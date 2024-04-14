const express = require('express');
const OAuth = require('oauth').OAuth;
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
    port: 6000
});
redisClient.connect();
const sessionStore = new RedisStore({ client: redisClient });

redisClient.on('error', function (err) {
    console.log('Could not establish a connection with Redis. ' + err);
});

redisClient.on('connect', function (err) {
    console.log('Connected to Redis successfully');
});

redisClient.on('end', () => {
    console.log('Redis client has disconnected from the server.');
});

if (!process.env.DOCKER_ENV) {
    require('dotenv').config();
}

// Only allow your specific frontend domain and enable credentials
const corsOptions = {
    origin: function (origin, callback) {
        callback(null, true)
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
        secure: 'auto', // Set secure cookies based on the connection protocol
        httpOnly: true, // Protect against client-side scripting accessing the cookie
        maxAge: 3600000 // Set cookie expiration, etc.
    }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const TWITTER_CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY;
const TWITTER_CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET;

const oauth = new OAuth(
    'https://api.twitter.com/oauth/request_token',
    'https://api.twitter.com/oauth/access_token',
    TWITTER_CONSUMER_KEY,
    TWITTER_CONSUMER_SECRET,
    '1.0A',
    'https://oauth.btiplatform.com/twitter-callback',
    'HMAC-SHA1'
);

app.get('/start-auth', (req, res) => {
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
    const { oauth_token, oauth_verifier } = req.query;
    oauth.getOAuthAccessToken(
        oauth_token,
        null,
        oauth_verifier,
        (error, accessToken, accessTokenSecret, results) => {
            if (error) {
                console.error('Error getting OAuth access token:', error);
                res.status(500).json({ status: 'failure', error: error });
            } else {
                // Store tokens in the session
                req.session.accessToken = accessToken;
                req.session.accessTokenSecret = accessTokenSecret;
                console.log('Send Session ID:', req.sessionID);
                console.log('Send Session Data:', req.session);  // TEST: Log session data for debugging
                // Redirect to the frontend with a session identifier
                res.redirect(`http://localhost:8080/auth-success.html?session_id=${req.sessionID}`);
            }
        }
    );
});

app.get('/check-auth-status', (req, res) => {
    const sessionId = req.query.session_id;  // Get the session ID from query parameters
    console.log("Received Session ID:", sessionId);

    if (!sessionId) {
        return res.status(400).send("No session ID provided");
    }

    // Retrieve the session from Redis
    sessionStore.get(sessionId, (err, session) => {
        if (err) {
            console.error('Error retrieving session:', err);
            return res.status(500).send("Failed to retrieve session");
        }

        if (session) {
            console.log("Received Session Data:", session);  // Log session data for debugging

            // Check if the session has the access token and token secret
            if (session.accessToken && session.accessTokenSecret) {
                res.json({ isAuthenticated: true });
            } else {
                res.json({ isAuthenticated: false });
            }
        } else {
            res.status(404).send("Session not found");
        }
    });
});
app.options('/check-auth-status', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/check-retweet', (req, res) => {
    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { tweetId } = req.query;

        checkIfRetweeted(req.session.accessToken, req.session.accessTokenSecret, tweetId)
            .then(result => res.json(result))
            .catch(error => res.status(500).json({
                error: "Failed to check retweet status",
                details: error
            }));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/check-retweet', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/check-follow', (req, res) => {
    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { targetUserId } = req.query;

        checkIfFollowed(req.session.accessToken, req.session.accessTokenSecret, targetUserId)
            .then(result => res.json(result))
            .catch(error => res.status(500).json({ error: error.toString() }));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/check-follow', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/check-like', (req, res) => {
    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { tweetId } = req.query;

        checkIfLiked(req.session.accessToken, req.session.accessTokenSecret, tweetId)
            .then(result => res.json(result))
            .catch(error => res.status(500).json({ error: error.toString() }));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/check-like', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/retweet', (req, res) => {
    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { tweetId } = req.query;
        retweetTweet(req.session.accessToken, req.session.accessTokenSecret, tweetId)
            .then(response => res.json(response))
            .catch(error => res.status(500).json(error));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/retweet', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/like', (req, res) => {
    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { tweetId } = req.query;
        likeTweet(req.session.accessToken, req.session.accessTokenSecret, tweetId)
            .then(response => res.json(response))
            .catch(error => res.status(500).json(error));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/like', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/bookmark', (req, res) => {
    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { tweetId } = req.query;
        bookmarkTweet(req.session.accessToken, req.session.accessTokenSecret, tweetId)
            .then(response => res.json(response))
            .catch(error => res.status(500).json(error));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/bookmark', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/follow', (req, res) => {
    if (req.session.accessToken && req.session.accessTokenSecret) {
        const { userId } = req.query;
        followUser(req.session.accessToken, req.session.accessTokenSecret, userId)
            .then(response => res.json(response))
            .catch(error => res.status(500).json(error));
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
});
app.options('/follow', cors(corsOptions)); // Enable preflight request for this endpoint

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

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
    return new Promise((resolve, reject) => {
        const oauth = new OAuth(
            'https://api.twitter.com/oauth/request_token',
            'https://api.twitter.com/oauth/access_token',
            process.env.TWITTER_CONSUMER_KEY,
            process.env.TWITTER_CONSUMER_SECRET,
            '1.0A',
            null,
            'HMAC-SHA1'
        );

        oauth[method.toLowerCase()](
            url,
            accessToken,  // OAuth access token
            accessTokenSecret,  // OAuth access token secret
            body,  // Post body for POST requests
            'application/json',  // Post content type
            (error, data, response) => {
                if (error) reject(error);
                else resolve(JSON.parse(data));
            }
        );
    });
}

function getUserTwitterId(accessToken, accessTokenSecret) {
    const oauth = new OAuth(
        'https://api.twitter.com/oauth/request_token',
        'https://api.twitter.com/oauth/access_token',
        process.env.TWITTER_CONSUMER_KEY,
        process.env.TWITTER_CONSUMER_SECRET,
        '1.0A',
        null,
        'HMAC-SHA1'
    );

    return new Promise((resolve, reject) => {
        const url = 'https://api.twitter.com/2/users/verify_credentials';
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
                        resolve(parsedData.id_str);  // Returns the string version of the user's ID
                    } catch (parseError) {
                        reject(parseError);
                    }
                }
            }
        );
    });
}

/**
 * @brief Retweets a tweet using the provided access token and access token secret.
 * 
 * @param {string} accessToken - The access token for authenticating the request.
 * @param {string} accessTokenSecret - The access token secret for authenticating the request.
 * @param {string} tweetId - The ID of the tweet to retweet.
 * 
 * @return {Promise} A Promise that resolves with the response from the retweet API call.
 * 
 * @note This function makes an authenticated request to the Twitter API to retweet a specific tweet.
 */
function retweetTweet(accessToken, accessTokenSecret, tweetId) {
    const url = `https://api.twitter.com/2/tweets/${tweetId}/retweet`;
    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url)
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
 * @param {string} tweetId - The ID of the tweet to be liked.
 * 
 * @return {Promise} A promise that resolves to the response of the API request.
 * 
 * @note This function makes an authenticated request to the Twitter API to like a tweet.
 */
function likeTweet(accessToken, accessTokenSecret, tweetId) {
    return getUserTwitterId(accessToken, accessTokenSecret)
        .then(userId => {
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
                });
        })
        .catch(error => {
            console.error('Failed to retrieve Twitter user ID:', error);
            throw error;  // Rethrow error to be handled by the caller
        });
}

/**
 * @brief Bookmarks a tweet using the provided access tokens.
 * 
 * @param {string} accessToken - The access token for authenticating the request.
 * @param {string} accessTokenSecret - The access token secret for authenticating the request.
 * @param {string} tweetId - The ID of the tweet to be bookmarked.
 * 
 * @return {Promise} A promise that resolves to the response of the API request.
 * 
 * @note This function makes an authenticated request to the Twitter API to bookmark a tweet.
 */
function bookmarkTweet(accessToken, accessTokenSecret, tweetId) {
    return getUserTwitterId(accessToken, accessTokenSecret)
        .then(userId => {
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
                });
        })
        .catch(error => {
            console.error('Failed to retrieve Twitter user ID:', error);
            throw error;  // Rethrow error to be handled by the caller
        });
}

/**
 * @brief Follows a user on Twitter using the provided access tokens.
 * 
 * @param {string} accessToken - The access token for the authenticated user.
 * @param {string} accessTokenSecret - The access token secret for the authenticated user.
 * @param {string} targetUserId - The ID of the user to follow.
 * 
 * @return {Promise} A promise that resolves when the user has been followed successfully.
 * 
 * @note This function first obtains the current user's Twitter ID and then makes an authenticated
 * request to follow the specified user using the obtained ID.
 */
function followUser(accessToken, accessTokenSecret, targetUserId) {
    // First, obtain the current user's Twitter ID
    return getUserTwitterId(accessToken, accessTokenSecret)
        .then(sourceUserId => {
            const url = `https://api.twitter.com/2/users/${sourceUserId}/following`;
            const body = JSON.stringify({
                target_user_id: targetUserId // ID of the user to follow
            });
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
                });
        })
        .catch(error => {
            console.error('Failed to retrieve Twitter user ID or follow user:', error);
            throw error;  // Rethrow error to be handled by the caller
        });
}

/**
 * @brief Checks if a tweet has been retweeted by the user.
 * 
 * @param {string} accessToken - The access token for authenticating the request.
 * @param {string} accessTokenSecret - The access token secret for authenticating the request.
 * @param {string} tweetId - The ID of the tweet to check for retweets.
 * 
 * @return {Promise<{retweeted: boolean}>} - A promise that resolves to an object containing the retweeted status.
 * 
 * @note This function makes an authenticated request to the Twitter API to fetch the user's timeline tweets
 * and checks if any tweet is a retweet of the specified tweetId.
 * If an error occurs during the process, it will be logged and rethrown to be handled by the caller.
 */
function checkIfRetweeted(accessToken, accessTokenSecret, tweetId) {
    // Twitter API endpoint to fetch user's timeline tweets
    const url = `https://api.twitter.com/2/users/${userId}/tweets?tweet.fields=retweeted_status&max_results=10`;

    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url)
        .then(tweets => {
            // Check if any tweet is a retweet of the specified tweetId
            const retweeted = tweets.some(tweet => tweet.retweeted_status && tweet.retweeted_status.id_str === tweetId);
            return { retweeted };
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
 * @param {string} targetUserId - The ID of the user to check if the authenticated user is following.
 * 
 * @return {Promise<{isFollowing: boolean}>} A promise that resolves to an object containing the following status.
 * @note This function makes an authenticated request to the Twitter API to check the relationship between the authenticated user and the target user.
 * If the authenticated user is following the target user, the promise resolves to { isFollowing: true }, otherwise it resolves to { isFollowing: false }.
 * If there is an error during the request, the promise is rejected with the error.
 */
function checkIfFollowed(accessToken, accessTokenSecret, targetUserId) {
    // Twitter API endpoint to check if the authenticated user is following another user
    const url = `https://api.twitter.com/2/users/${targetUserId}/following`;

    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url)
        .then(response => {
            return { isFollowing: response.relationship.source.following };
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
 * @param {string} tweetId - The ID of the tweet to check if liked.
 * 
 * @return {Promise<{ hasLiked: boolean }>} - A promise that resolves to an object containing the result of the check.
 * @note This function makes an authenticated request to the Twitter API to fetch the user's liked tweets and checks if any of them match the specified tweetId.
 */
function checkIfLiked(accessToken, accessTokenSecret, tweetId) {
    // Twitter API endpoint to fetch the user's likes
    const url = `https://api.twitter.com/2/users/${userId}/liked_tweets`;

    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url)
        .then(tweets => {
            // Check if any liked tweet matches the specified tweetId
            const hasLiked = tweets.some(tweet => tweet.id_str === tweetId);
            return { hasLiked };
        })
        .catch(error => {
            console.error('Error checking if liked:', error);
            throw error;
        });
}
