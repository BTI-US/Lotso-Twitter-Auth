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

const airdropCountAddress = process.env.AIRDROP_COUNT_ADDRESS || 'http://localhost:8081/v1/info/set_airdrop';
const airdropRewardAddress = process.env.AIRDROP_REWARD_ADDRESS || 'http://localhost:8081/v1/info/append_airdrop';
const webpageAddress = process.env.WEBPAGE_ADDRESS || 'https://lotso.org';
const authWebAddress = process.env.AUTH_WEB_ADDRESS || 'https://oauth.btiplatform.com';
const airdropRewardMaxForBuyer = process.env.AIRDROP_REWARD_MAX_FOR_BUYER || '10000000';
const airdropRewardMaxForNotBuyer = process.env.AIRDROP_REWARD_MAX_FOR_NOT_BUYER || '2000000';
const airdropPerPerson = process.env.AIRDROP_PER_PERSON || '50000';
const airdropPerStep = process.env.AIRDROP_PER_STEP || '50000';
const lotsoPurchasedUserAmount = process.env.LOTSO_PURCHASED_USER_AMOUNT || '300000';

const app = express();
app.set('trust proxy', 1); // Trust the first proxy

const redisClient = redis.createClient({
    socket: {
        host: process.env.REDIS_HOST || 'redis',
        port: process.env.REDIS_PORT || '6379',
    },
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
if (!TWITTER_CONSUMER_KEY || !TWITTER_CONSUMER_SECRET) {
    console.error('Twitter consumer key and secret are required. Exiting...');
    process.exit(1);
}

app.get('/start-auth', (req, res) => {    
    const oauth = new OAuth(
        'https://api.twitter.com/oauth/request_token',
        'https://api.twitter.com/oauth/access_token',
        TWITTER_CONSUMER_KEY,
        TWITTER_CONSUMER_SECRET,
        '1.0A',
        `${authWebAddress}/twitter-callback`,
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
        `${authWebAddress}/twitter-callback`,
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
                res.redirect(`${webpageAddress}/auth-success.html`);
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

app.get('/check-retweet', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /check-retweet");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { tweetId } = req.query;
    if (!tweetId) {
        return res.status(400).json({ error: 'tweetId are required' });
    }

    try {
        // Fetch the user ID from the username first
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);
        const result = await utils.checkIfRetweeted(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        res.json(result);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.toString() });
    }
});
app.options('/check-retweet', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/check-follow', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /check-follow");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { userName } = req.query; // Get the username from the query parameters
    if (!userName) {
        return res.status(400).json({ error: 'userName are required' });
    }

    try {
        // Fetch the user ID from the username first
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);

        // Fetch the target user's ID from the username
        const targetUserId = await utils.fetchUserId(userName, req.session.accessToken, req.session.accessTokenSecret);

        // Now check if the user is followed using the fetched user ID
        const result = await utils.checkIfFollowed(req.session.accessToken, req.session.accessTokenSecret, userId, targetUserId);

        res.json(result);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.toString() });
    }
});
app.options('/check-follow', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/check-like', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /check-like");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { tweetId } = req.query;
    if (!tweetId) {
        return res.status(400).json({ error: 'tweetId are required' });
    }

    try {
        // Get the current user's Twitter ID
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);

        // With the user ID, proceed to retweet the specified tweet
        const result = await utils.checkIfLiked(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        res.json(result);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.toString() });
    }
});
app.options('/check-like', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/check-bookmark', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /check-bookmark");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { tweetId } = req.query;
    if (!tweetId) {
        console.log("tweetId not found");
        return res.status(400).json({ error: 'tweetId is required' });
    }

    try {
        // Fetch the user ID from the username first
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);
        const result = await utils.checkIfBookmarked(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        res.json(result);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.toString() });
    }
});
app.options('/check-bookmark', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/retweet', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /retweet");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { tweetId } = req.query;
    if (!tweetId) {
        console.log("tweetId not found");
        return res.status(400).json({ error: 'tweetId is required' });
    }

    try {
        // Get the current user's Twitter ID
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);
        console.log("Current User ID is:", userId);

        // Check if the tweet has been retweeted by the user
        const result = await utils.checkIfRetweeted(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        if (result.isRetweeted) {
            console.log("Tweet has been retweeted before");
            return res.json({ status: 'success', message: 'Tweet has been retweeted before' });
        }

        // With the user ID, proceed to retweet the specified tweet
        const response = await utils.retweetTweet(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        res.json(response);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.toString() });
    }
});
app.options('/retweet', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/like', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /like");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { tweetId } = req.query;
    if (!tweetId) {
        console.log("tweetId not found");
        return res.status(400).json({ error: 'tweetId is required' });
    }

    try {
        // Fetch the user ID from the username
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);

        // Check if the tweet has been liked by the user
        const result = await utils.checkIfLiked(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);

        if (result.isLiked) {
            console.log("Tweet has been liked before");
            return res.json({ status: 'success', message: 'Tweet has been liked before' });
        }

        // Use the userId to like the tweet
        const response = await utils.likeTweet(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        res.json(response);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.toString() });
    }
});
app.options('/like', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/bookmark', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /bookmark");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { tweetId } = req.query;
    if (!tweetId) {
        console.log("tweetId not found");
        return res.status(400).json({ error: 'tweetId is required' });
    }

    try {
        // Fetch the user ID from the username
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);

        // Check if the tweet has been bookmarked by the user
        const result = await utils.checkIfBookmarked(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);

        if (result.isBookmarked) {
            console.log("Tweet has been bookmarked before");
            return res.json({ status: 'success', message: 'Tweet has been bookmarked before' });
        }

        // Use the userId to bookmark the tweet
        const response = await utils.bookmarkTweet(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        res.json(response);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.toString() });
    }
});
app.options('/bookmark', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/follow-us', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /follow-us");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { userName } = req.query;
    if (!userName) {
        console.log("tweetId not found");
        return res.status(400).json({ error: 'userName are required' });
    }

    try {
        // Fetch the user ID from the username
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);

        // Fetch the target user's ID from the username
        const targetUserId = await utils.fetchUserId(userName, req.session.accessToken, req.session.accessTokenSecret);

        // Use the userId to follow the user
        const response = await utils.followUser(req.session.accessToken, req.session.accessTokenSecret, userId, targetUserId);

        res.json(response);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.toString() });
    }
});
app.options('/follow-us', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/check-airdrop', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /check-airdrop");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { address } = req.query;
    if (!address) {
        console.log("Address not found");
        return res.status(400).json({ error: 'Address is required' });
    }

    try {

        // Fetch the user ID from the username first
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);
        const result = await utils.checkIfClaimedAirdrop(userId, address);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to check airdrop status', details: error });
    }
});
app.options('/check-airdrop', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/log-airdrop', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /log-airdrop");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { address } = req.query;
    if (!address) {
        console.log("Address not found");
        return res.status(400).json({ error: 'Address is required' });
    }

    try {
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);
        const result = await utils.logUserAirdrop(userId, address);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: "Failed to log airdrop status",
            details: error,
        });
    }
});
app.options('/log-airdrop', cors(corsOptions)); // Enable preflight request for this endpoint

// This endpoint will only be trigger when the user clicks the "Check Airdrop Amount" button
app.get('/check-airdrop-amount', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /check-airdrop-amount");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { address, promotionCode, step } = req.query;
    if (!address || !step) {
        console.log("Address or step not found");
        return res.status(400).json({ error: 'Address and step are required' });
    }
    const stepNumber = Number(step);
    if (!Number.isInteger(stepNumber) || ![0, 1, 2, 3, 4].includes(stepNumber)) {
        console.log("Step is not a valid number");
        return res.status(400).json({ error: 'Step must be a number and value is 0,1,2,3,4' });
    }

    // Check if the user address has purchased the first generation of $Lotso tokens
    try {
        const purchaseResult = await utils.checkIfPurchased(address);
        let airdrop_amount = 0;

        if (!purchaseResult.purchase) {
            if (!promotionCode) {
                console.log("Promotion code not found");
                return res.status(400).json({ error: 'Promotion code is required' });
            }
            try {
                const promoResult = await utils.usePromotionCode(address, promotionCode);
                if (promoResult.valid) {
                    airdrop_amount = stepNumber * parseInt(airdropPerStep, 10);
                    console.log('Promotion code applied successfully:', promoResult);
                } else {
                    console.error('Invalid promotion code:', address);
                    return res.status(400).json({
                        error: 'Invalid promotion code',
                    });
                }
            } catch (promoError) {
                console.error('Failed to apply promotion code:', promoError);
                return res.status(500).json({
                    error: 'Failed to apply promotion code',
                    details: promoError,
                });
            }
        } else {
            // For the buyer, the airdrop amount is fixed (e.g., 300,000)
            airdrop_amount = parseInt(lotsoPurchasedUserAmount, 10);
        }

        // Prepare data for the POST request
        const postData = {
            address,
            purchase: purchaseResult.purchase,
            amount: airdrop_amount,
        };

        // Perform a HTTP POST request
        const response = await fetch(airdropCountAddress, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(postData),
        });
        const data = await response.json();
        console.log('Airdrop checking response:', data);
        res.json(data);
    } catch (error) {
        console.error('Error in handling the request:', error);
        res.status(500).json({
            error: "Failed to handle the request",
            details: error.toString(),
        });
    }
});
app.options('/check-airdrop-amount', cors(corsOptions)); // Enable preflight request for this endpoint

// This endpoint will only be trigger when the user clicks the "Generate Promotion Code" button
app.get('/generate-promotion-code', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /generate-promotion-code");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { address } = req.query;
    if (!address) {
        console.log("Address not found");
        return res.status(400).json({ error: 'Address are required' });
    }

    try {
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);
        const result = await utils.checkIfFinished(userId);
        if (result.isFinished) {
            console.log("User has completed all required steps and is eligible for obtaining the promotion code.");
            const promotionCode = await utils.generatePromotionCode(address);
            if (promotionCode) {
                res.json({ promotion_code: promotionCode });
            } else {
                res.status(500).json({ error: 'Failed to generate promotion code' });
            }
        } else {
            res.json(result);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.options('/generate-promotion-code', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/send-airdrop-parent', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /send-airdrop-parent");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { address } = req.query;
    if (!address) {
        console.log("Address not found");
        return res.status(400).json({ error: 'Address is required' });
    }

    try {
        const { parentAddress } = await utils.rewardParentUser(address);
        const { appendAmount, reward } = await utils.checkRewardParentUser(parentAddress, airdropPerPerson, {
            airdropRewardMaxForBuyer, airdropRewardMaxForNotBuyer,
        });

        console.log('The append airdrop amount:', appendAmount);
        if (!reward) {
            console.log('The total airdrop amount is exceeded the limitation');
            return res.json({ reward });
        }

        const apiUrl = `${airdropRewardAddress}?address=${encodeURIComponent(parentAddress)}&amount=${encodeURIComponent(appendAmount)}`;
        const response = await fetch(apiUrl);
        const { airdrop_amount: logAirdropAmount } = await response.json();

        console.log('Airdrop checking response:', logAirdropAmount);
        if (!logAirdropAmount) {
            console.log('The total airdrop amount is exceeded the limitation:', logAirdropAmount);
            return res.json({ airdrop_amount: logAirdropAmount });
        }

        const { totalRewardAmount: rewardAmount } = await utils.appendRewardParentUser(parentAddress, logAirdropAmount);
        console.log('Parent rewarded successfully:', rewardAmount);

        // TODO:
        res.json({ success: true, apiUrl });
    } catch (error) {
        console.error('Error in handling the request:', error);
        res.status(500).json({
            error: "Failed to handle the request",
            details: error.toString(),
        });
    }
});

app.options('/send-airdrop-parent', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/check-purchase', async (req, res) => {
    if (!req.session) {
        return res.status(400).send("No session found");
    }
    console.log("Endpoint hit: /check-purchase");

    if (!req.session.accessToken || !req.session.accessTokenSecret) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { address } = req.query;
    if (!address) {
        console.log("Address not found");
        return res.status(400).json({ error: 'Address are required' });
    }

    try {
        // Check if the user address has purchased the first generation of $Lotso tokens
        const result = await utils.checkIfPurchased(address);
        res.json(result);
    } catch (error) {
        console.error("Failed to check purchase:", error);
        res.status(500).json({
            error: "Failed to check purchase",
            details: error,
        });
    }
});
app.options('/check-purchase', cors(corsOptions)); // Enable preflight request for this endpoint

app.get('/subscription-info', (req, res) => {
    console.log("Endpoint hit: /subscription-info");

    const { name, email, info } = req.query;
    if (!email) {
        console.log("Email not found");
        return res.status(400).json({ error: 'Email is required' });
    }

    // Log the subscription info
    utils.logSubscriptionInfo(email, name, info)
        .then(result => res.json(result))
        .catch(error => res.status(500).json({
            error: "Failed to log subscription info",
            details: error,
        }));
});
app.options('/subscription-info', cors(corsOptions)); // Enable preflight request for this endpoint

const SERVER_PORT = process.env.SERVER_PORT || 5000;
const keyPath = process.env.PRIVKEY_PATH;
const certPath = process.env.CERT_PATH;

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.error('Required certificate files not found. Exiting...');
    process.exit(1);
}

https.createServer({
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
}, app)
.listen(SERVER_PORT, () => {
    console.log(`Listening on port ${SERVER_PORT}!`);
});
