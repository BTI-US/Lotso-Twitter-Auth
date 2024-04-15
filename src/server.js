const express = require('express');
const https = require('https');
const fs = require('fs');
const { OAuth } = require('oauth');
const cors = require('cors');
const session = require('express-session');
const crypto = require('crypto');
const redis = require('redis');
const RedisStore = require('connect-redis').default;
const utils = require('./function');

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

// Function to generate a secret key
function generateSecretKey(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

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
app.options('/twitter-callback', cors(corsOptions)); // Enable preflight request for this endpoint

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
        utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                utils.checkIfRetweeted(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId)
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
        utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                // Now check if the user is followed using the fetched user ID
                utils.checkIfFollowed(req.session.accessToken, req.session.accessTokenSecret, userId)
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
        utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                // With the user ID, proceed to retweet the specified tweet
                utils.checkIfLiked(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId)
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
        utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                utils.checkIfBookmarked(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId)
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
        utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                console.log("Current User ID is:", userId);
                // With the user ID, proceed to retweet the specified tweet
                utils.retweetTweet(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId)
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
        utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                // Use the userId to like the tweet
                utils.likeTweet(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId)
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
        utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                // Use the userId to bookmark the tweet
                utils.bookmarkTweet(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId)
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
        utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret)
            .then(userId => {
                // Fetch the target user's ID from the username
                utils.fetchUserId(userName, req.session.accessToken, req.session.accessTokenSecret)
                    .then(targetUserId => {
                        // Use the userId to follow the user
                        utils.followUser(req.session.accessToken, req.session.accessTokenSecret, userId, targetUserId)
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