const https = require('https');
const fs = require('fs');
const { OAuth } = require('oauth');
const cors = require('cors');
const utils = require('./function');
const { createResponse } = require('./response');
const { app, corsOptions } = require('./appConfig');

const airdropCountAddress = `http://${process.env.AIRDROP_SERVER_HOST}:${process.env.AIRDROP_SERVER_PORT}/v1/info/set_airdrop`;
const airdropRewardAddress = `http://${process.env.AIRDROP_SERVER_HOST}:${process.env.AIRDROP_SERVER_PORT}/v1/info/append_airdrop`;
const recipientCheckAddress = `http://${process.env.AIRDROP_SERVER_HOST}:${process.env.AIRDROP_SERVER_PORT}/v1/info/recipient_info`;
const webpageAddress = process.env.WEBPAGE_ADDRESS || 'https://lotso.org';
const authWebAddress = process.env.AUTH_WEB_ADDRESS || 'https://api.btiplatform.com';
const airdropRewardMaxForBuyer = process.env.AIRDROP_REWARD_MAX_FOR_BUYER || '10000000';
const airdropRewardMaxForNotBuyer = process.env.AIRDROP_REWARD_MAX_FOR_NOT_BUYER || '2000000';
const airdropPerPerson = process.env.AIRDROP_PER_PERSON || '50000';
const airdropPerStep = process.env.AIRDROP_PER_STEP || '50000';
const lotsoPurchasedUserAmount = process.env.LOTSO_PURCHASED_USER_AMOUNT || '300000';
const checkRetweetEnabled = process.env.CHECK_RETWEET_ENABLED === 'true';
const checkRetweet2Enabled = process.env.CHECK_RETWEET_2_ENABLED === 'true';
const checkLikeEnabled = process.env.CHECK_LIKE_ENABLED === 'true';

const { TWITTER_CONSUMER_KEY, TWITTER_CONSUMER_SECRET } = process.env;
if (!TWITTER_CONSUMER_KEY || !TWITTER_CONSUMER_SECRET) {
    console.error('Twitter consumer key and secret are required. Exiting...');
    process.exit(1);
}

/**
 * @swagger
 * /start-auth:
 *   get:
 *     summary: Start Twitter OAuth authentication
 *     description: This endpoint initiates the OAuth process with Twitter and redirects the user to the Twitter authentication page.
 *     parameters:
 *       - in: query
 *         name: callback
 *         schema:
 *           type: string
 *         required: true
 *         description: Callback URL to redirect to after successful authentication
 *     responses:
 *       200:
 *         description: Redirects the user to the Twitter authentication page
 *       500:
 *         description: Returns an error if the OAuth request token retrieval fails
 */
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
            // Create a new error object to avoid direct modification
            const modifiedError = {
                ...error,
                code: 10050,
            };
            const response = createResponse(modifiedError.code, modifiedError.message);
            res.status(500).json(response);
        } else {
            const url = `https://api.twitter.com/oauth/authenticate?oauth_token=${oauthToken}`;
            console.log('Redirecting user to Twitter authentication page');
            res.redirect(url);
        }
    });
});
app.options('/start-auth', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /twitter-callback:
 *   get:
 *     summary: Twitter OAuth callback endpoint
 *     description: This endpoint handles the callback from Twitter after the user has authenticated. It retrieves the OAuth access token and stores it in the session.
 *     parameters:
 *       - in: query
 *         name: oauth_token
 *         schema:
 *           type: string
 *         required: true
 *         description: The OAuth token provided by Twitter
 *       - in: query
 *         name: oauth_verifier
 *         schema:
 *           type: string
 *         required: true
 *         description: The OAuth verifier provided by Twitter
 *     responses:
 *       302:
 *         description: Redirects to the frontend with a session identifier after successful authentication
 *       500:
 *         description: Returns an error if getting the OAuth access token fails
 */
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
                // Create a new error object with the additional property
                const modifiedError = {
                    ...error,
                    code: 10050,
                };
                const response = createResponse(modifiedError.code, modifiedError.message);
                res.status(500).json(response);
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

/**
 * @swagger
 * /check-auth-status:
 *   get:
 *     summary: Check authentication status
 *     description: This endpoint checks if the user is authenticated by looking for the access token and token secret in the session.
 *     responses:
 *       200:
 *         description: The user is authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     isAuthenticated:
 *                       type: boolean
 *       400:
 *         description: No session found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     isAuthenticated:
 *                       type: boolean
 */
app.get('/check-auth-status', (req, res) => {
    // Assume the session ID is automatically managed through the cookie
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /check-auth-status");

    // Check if the session has the access token and token secret
    if (req.session.accessToken && req.session.accessTokenSecret) {
        const response = createResponse(0, 'Success', { isAuthenticated: true });
        res.json(response);
    } else {
        const response = createResponse(0, 'Success', { isAuthenticated: false });
        res.status(401).json(response);
    }
});
app.options('/check-auth-status', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /check-retweet:
 *   get:
 *     summary: Check if a tweet has been retweeted by the authenticated user
 *     description: This endpoint checks if the authenticated user has retweeted a specific tweet.
 *     parameters:
 *       - in: query
 *         name: tweetId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the tweet to check
 *     responses:
 *       200:
 *         description: Returns the retweet status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     retweeted:
 *                       type: boolean
 *       400:
 *         description: No session found or tweetId not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/check-retweet', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /check-retweet");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { tweetId } = req.query;
    if (!tweetId) {
        console.log("tweetId not found");
        const response = createResponse(10005, 'tweetId are required');
        return res.status(400).json(response);
    }

    try {
        // Fetch the user ID from the username first
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);
        const result = await utils.checkIfRetweeted(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        const response = createResponse(0, 'Success', result);
        res.json(response);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        const response = createResponse(error.code || 10000, error.message);
        res.status(statusCode).json(response);
    }
});
app.options('/check-retweet', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /check-follow:
 *   get:
 *     summary: Check if a user is followed by the authenticated user
 *     description: This endpoint checks if the authenticated user is following a specific user.
 *     parameters:
 *       - in: query
 *         name: userName
 *         schema:
 *           type: string
 *         required: true
 *         description: The username of the user to check
 *     responses:
 *       200:
 *         description: Returns the follow status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     following:
 *                       type: boolean
 *       400:
 *         description: No session found or userName not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/check-follow', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /check-follow");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { userName } = req.query; // Get the username from the query parameters
    if (!userName) {
        console.log("userName not found");
        const response = createResponse(10006, 'userName are required');
        return res.status(400).json(response);
    }

    try {
        // Fetch the user ID from the username first
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);

        // Fetch the target user's ID from the username
        const targetUserId = await utils.fetchUserId(userName, req.session.accessToken, req.session.accessTokenSecret);

        // Now check if the user is followed using the fetched user ID
        const result = await utils.checkIfFollowed(req.session.accessToken, req.session.accessTokenSecret, userId, targetUserId);
        const response = createResponse(0, 'Success', result);
        res.json(response);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        const response = createResponse(error.code || 10000, error.message);
        res.status(statusCode).json(response);
    }
});
app.options('/check-follow', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /check-like:
 *   get:
 *     summary: Check if a tweet has been liked by the authenticated user
 *     description: This endpoint checks if the authenticated user has liked a specific tweet.
 *     parameters:
 *       - in: query
 *         name: tweetId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the tweet to check
 *     responses:
 *       200:
 *         description: Returns the like status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     liked:
 *                       type: boolean
 *       400:
 *         description: No session found or tweetId not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/check-like', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /check-like");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { tweetId } = req.query;
    if (!tweetId) {
        console.log("tweetId not found");
        const response = createResponse(10005, 'tweetId are required');
        return res.status(400).json(response);
    }

    try {
        // Get the current user's Twitter ID
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);

        // With the user ID, proceed to retweet the specified tweet
        const result = await utils.checkIfLiked(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        const response = createResponse(0, 'Success', result);
        res.json(response);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        const response = createResponse(error.code || 10000, error.message);
        res.status(statusCode).json(response);
    }
});
app.options('/check-like', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /check-bookmark:
 *   get:
 *     summary: Check if a tweet has been bookmarked by the authenticated user
 *     description: This endpoint checks if the authenticated user has bookmarked a specific tweet.
 *     parameters:
 *       - in: query
 *         name: tweetId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the tweet to check
 *     responses:
 *       200:
 *         description: Returns the bookmark status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     bookmarked:
 *                       type: boolean
 *       400:
 *         description: No session found or tweetId not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/check-bookmark', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /check-bookmark");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { tweetId } = req.query;
    if (!tweetId) {
        console.log("tweetId not found");
        const response = createResponse(10005, 'tweetId are required');
        return res.status(400).json(response);
    }

    try {
        // Fetch the user ID from the username first
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);
        const result = await utils.checkIfBookmarked(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        const response = createResponse(0, 'Success', result);
        res.json(response);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        const response = createResponse(error.code || 10000, error.message);
        res.status(statusCode).json(response);
    }
});
app.options('/check-bookmark', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /retweet:
 *   get:
 *     summary: Retweet a specific tweet
 *     description: This endpoint allows the authenticated user to retweet a specific tweet.
 *     parameters:
 *       - in: query
 *         name: tweetId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the tweet to retweet
 *     responses:
 *       200:
 *         description: Returns the retweet status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     retweeted:
 *                       type: boolean
 *       400:
 *         description: No session found or tweetId not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/retweet', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /retweet");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { tweetId } = req.query;
    if (!tweetId) {
        console.log("tweetId not found");
        const response = createResponse(10005, 'tweetId are required');
        return res.status(400).json(response);
    }

    try {
        // Get the current user's Twitter ID
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);
        console.log("Current User ID is:", userId);

        // Check if the tweet has been retweeted by the user
        const result = await utils.checkIfRetweeted(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        if (result.isRetweeted) {
            console.log("Tweet has been retweeted before");
            const response = createResponse(10017, 'Tweet has been retweeted before');
            return res.json(response);
        }

        // With the user ID, proceed to retweet the specified tweet
        const responseRetweet = await utils.retweetTweet(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        const response = createResponse(0, 'Success', responseRetweet);
        res.json(response);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        const response = createResponse(error.code || 10000, error.message);
        res.status(statusCode).json(response);
    }
});
app.options('/retweet', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /like:
 *   get:
 *     summary: Like a specific tweet
 *     description: This endpoint allows the authenticated user to like a specific tweet.
 *     parameters:
 *       - in: query
 *         name: tweetId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the tweet to like
 *     responses:
 *       200:
 *         description: Returns the like status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     liked:
 *                       type: boolean
 *       400:
 *         description: No session found or tweetId not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/like', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /like");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { tweetId } = req.query;
    if (!tweetId) {
        console.log("tweetId not found");
        const response = createResponse(10005, 'tweetId are required');
        return res.status(400).json(response);
    }

    try {
        // Fetch the user ID from the username
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);

        // Check if the tweet has been liked by the user
        const result = await utils.checkIfLiked(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);

        if (result.isLiked) {
            console.log("Tweet has been liked before");
            const response = createResponse(10018, 'Tweet has been liked before');
            return res.json(response);
        }

        // Use the userId to like the tweet
        const responseLike = await utils.likeTweet(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        const response = createResponse(0, 'Success', responseLike);
        res.json(response);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        const response = createResponse(error.code || 10000, error.message);
        res.status(statusCode).json(response);
    }
});
app.options('/like', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /bookmark:
 *   get:
 *     summary: Bookmark a specific tweet
 *     description: This endpoint allows the authenticated user to bookmark a specific tweet.
 *     parameters:
 *       - in: query
 *         name: tweetId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the tweet to bookmark
 *     responses:
 *       200:
 *         description: Returns the bookmark status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     bookmarked:
 *                       type: boolean
 *       400:
 *         description: No session found or tweetId not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/bookmark', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /bookmark");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { tweetId } = req.query;
    if (!tweetId) {
        console.log("tweetId not found");
        const response = createResponse(10005, 'tweetId are required');
        return res.status(400).json(response);
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
        const responseBookmark = await utils.bookmarkTweet(req.session.accessToken, req.session.accessTokenSecret, userId, tweetId);
        const response = createResponse(0, 'Success', responseBookmark);
        res.json(response);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        const response = createResponse(error.code || 10000, error.message);
        res.status(statusCode).json(response);
    }
});
app.options('/bookmark', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /follow-us:
 *   get:
 *     summary: Follow a specific user
 *     description: This endpoint allows the authenticated user to follow a specific user.
 *     parameters:
 *       - in: query
 *         name: userName
 *         schema:
 *           type: string
 *         required: true
 *         description: The username of the user to follow
 *     responses:
 *       200:
 *         description: Returns the follow status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     followed:
 *                       type: boolean
 *       400:
 *         description: No session found or userName not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/follow-us', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /follow-us");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { userName } = req.query;
    if (!userName) {
        console.log("tweetId not found");
        const response = createResponse(10006, 'userName are required');
        return res.status(400).json(response);
    }

    try {
        // Fetch the user ID from the username
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);

        // Fetch the target user's ID from the username
        const targetUserId = await utils.fetchUserId(userName, req.session.accessToken, req.session.accessTokenSecret);

        // Use the userId to follow the user
        const responseFollow = await utils.followUser(req.session.accessToken, req.session.accessTokenSecret, userId, targetUserId);
        const response = createResponse(0, 'Success', responseFollow);
        res.json(response);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        const response = createResponse(error.code || 10000, error.message);
        res.status(statusCode).json(response);
    }
});
app.options('/follow-us', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /check-airdrop:
 *   get:
 *     summary: Check airdrop status for a specific address
 *     description: This endpoint allows the authenticated user to check the airdrop status for a specific address.
 *     parameters:
 *       - in: query
 *         name: address
 *         schema:
 *           type: string
 *         required: true
 *         description: The address to check the airdrop status for
 *     responses:
 *       200:
 *         description: Returns the airdrop status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     claimed:
 *                       type: boolean
 *       400:
 *         description: No session found or address not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/check-airdrop', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /check-airdrop");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { address } = req.query;
    if (!address) {
        console.log("Address not found");
        const response = createResponse(10004, 'Address is required');
        return res.status(400).json(response);
    }

    try {
        // Fetch the user ID from the username first
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);
        const result = await utils.checkIfClaimedAirdrop(userId, address);
        const response = createResponse(0, 'Success', result);
        res.json(response);
    } catch (error) {
        const response = createResponse(error.code || 10000, error.message);
        res.status(500).json(response);
    }
});
app.options('/check-airdrop', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /log-airdrop:
 *   get:
 *     summary: Log airdrop for a specific address
 *     description: This endpoint allows the authenticated user to log the airdrop for a specific address.
 *     parameters:
 *       - in: query
 *         name: address
 *         schema:
 *           type: string
 *         required: true
 *         description: The address to log the airdrop for
 *     responses:
 *       200:
 *         description: Returns the airdrop log status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     logged:
 *                       type: boolean
 *       400:
 *         description: No session found or address not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/log-airdrop', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /log-airdrop");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { address } = req.query;
    if (!address) {
        console.log("Address not found");
        const response = createResponse(10004, 'Address is required');
        return res.status(400).json(response);
    }

    try {
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);
        const result = await utils.logUserAirdrop(userId, address);
        const response = createResponse(0, 'Success', result);
        res.json(response);
    } catch (error) {
        const response = createResponse(error.code || 10000, error.message);
        res.status(500).json(response);
    }
});
app.options('/log-airdrop', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /check-airdrop-amount:
 *   get:
 *     summary: Check airdrop amount for a specific address
 *     description: This endpoint allows the authenticated user to check the airdrop amount for a specific address.
 *                  This endpoint will only be trigger when the user clicks the "Check Airdrop Amount" button
 *     parameters:
 *       - in: query
 *         name: address
 *         schema:
 *           type: string
 *         required: true
 *         description: The address to check the airdrop amount for
 *       - in: query
 *         name: promotionCode
 *         schema:
 *           type: string
 *         required: false
 *         description: The promotion code to apply
 *       - in: query
 *         name: step
 *         schema:
 *           type: integer
 *         required: true
 *         description: The step number (0, 1, 2, 3, 4)
 *     responses:
 *       200:
 *         description: Returns the airdrop amount
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                     purchase:
 *                       type: boolean
 *                     amount:
 *                       type: integer
 *       400:
 *         description: No session found, address or step not provided, or invalid promotion code
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API or while processing the promotion code
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/check-airdrop-amount', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /check-airdrop-amount");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { address, promotionCode, step } = req.query;
    if (!address || !step) {
        console.log("Address or step not found");
        const response = createResponse(10004, 'Address and step are required');
        return res.status(400).json(response);
    }
    const stepNumber = Number(step);
    if (!Number.isInteger(stepNumber) || ![0, 1, 2, 3, 4].includes(stepNumber)) {
        console.log("Step is not a valid number");
        const response = createResponse(10023, 'Step must be a number and value is 0,1,2,3,4');
        return res.status(400).json(response);
    }

    // Check if the user address has purchased the first generation of $Lotso tokens
    try {
        const purchaseResult = await utils.checkIfPurchased(address);
        let airdrop_amount = 0;

        if (!purchaseResult.purchase) {
            if (!promotionCode) {
                console.log("Promotion code not found");
                const response = createResponse(10024, 'Promotion code is required');
                return res.status(400).json(response);
            }
            try {
                const promoResult = await utils.usePromotionCode(address, promotionCode);
                if (promoResult.valid) {
                    airdrop_amount = stepNumber * parseInt(airdropPerStep, 10);
                    console.log('Promotion code applied successfully:', promoResult);
                } else {
                    console.error('Invalid promotion code:', address);
                    const response = createResponse(10025, 'Invalid promotion code');
                    return res.status(400).json(response);
                }
            } catch (promoError) {
                console.error('Failed to apply promotion code:', promoError);
                const response = createResponse(10026, 'Error while processing promotion code');
                return res.status(500).json(response);
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

        // Endpoint: /set_airdrop
        const response = await fetch(airdropCountAddress, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(postData),
        });

        const data = await response.json();
        console.log('Airdrop checking response:', data);
        // Note: Do not encapsulate this response in the createResponse function
        res.json(data);
    } catch (error) {
        console.error('Error in handling the request:', error);
        const response = createResponse(error.code || 10000, error.message);
        res.status(500).json(response);
    }
});
app.options('/check-airdrop-amount', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /generate-promotion-code:
 *   get:
 *     summary: Generate a promotion code for a specific address
 *     description: This endpoint allows the authenticated user to generate a promotion code for a specific address.
 *                  This endpoint will only be trigger when the user clicks the "Generate Promotion Code" button
 *     parameters:
 *       - in: query
 *         name: address
 *         schema:
 *           type: string
 *         required: true
 *         description: The address to generate the promotion code for
 *     responses:
 *       200:
 *         description: Returns the generated promotion code
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     promotion_code:
 *                       type: string
 *       400:
 *         description: No session found or address not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API or while generating the promotion code
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/generate-promotion-code', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /generate-promotion-code");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { address } = req.query;
    if (!address) {
        console.log("Address not found");
        const response = createResponse(10004, 'Address is required');
        return res.status(400).json(response);
    }

    try {
        const userId = await utils.getUserTwitterId(req.session.accessToken, req.session.accessTokenSecret);

        // Note: `follow` is not included in the requiredTypes array
        const requiredTypes = [];
        let sameType = null;

        if (checkRetweetEnabled || checkRetweet2Enabled) {
            requiredTypes.push("retweet");
        }
        if (checkLikeEnabled) {
            requiredTypes.push("like");
        }
        sameType = (checkRetweetEnabled && checkRetweet2Enabled) ? "retweet" : "";

        const result = await utils.checkIfFinished(userId, requiredTypes, sameType);
        if (result.isFinished) {
            console.log("User has completed all required steps and is eligible for obtaining the promotion code.");
            const promotionCode = await utils.generatePromotionCode(address);
            if (promotionCode) {
                const response = createResponse(0, 'Success', { promotion_code: promotionCode });
                res.json(response);
            } else {
                const response = createResponse(10030, 'Failed to generate promotion code');
                res.status(500).json(response);
            }
        } else {
            const response = createResponse(10031, 'User has not completed the required steps', result);
            res.json(response);
        }
    } catch (error) {
        const response = createResponse(error.code || 10000, error.message);
        res.status(500).json(response);
    }
});
app.options('/generate-promotion-code', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /send-airdrop-parent:
 *   get:
 *     summary: Send airdrop to the parent of a specific address
 *     description: This endpoint allows the authenticated user to send an airdrop to the parent of a specific address.
 *     parameters:
 *       - in: query
 *         name: address
 *         schema:
 *           type: string
 *         required: true
 *         description: The address to send the airdrop to its parent
 *     responses:
 *       200:
 *         description: Returns the airdrop status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     airdrop_count:
 *                       type: integer
 *       400:
 *         description: No session found or address not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API or while processing the airdrop
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/send-airdrop-parent', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /send-airdrop-parent");

    if (!(req.session.accessToken && req.session.accessTokenSecret)) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { address } = req.query;
    if (!address) {
        console.log("Address not found");
        const response = createResponse(10004, 'Address is required');
        return res.status(400).json(response);
    }

    try {
        const { parentAddress } = await utils.findParentUserAddress(address);
        const { appendAmount, reward, maxReward } = await utils.checkRewardParentUser(parentAddress, airdropPerPerson, {
            airdropRewardMaxForBuyer, airdropRewardMaxForNotBuyer,
        });

        console.log('The append airdrop amount:', appendAmount);
        // First check: Do not send the request if the airdrop amount exceeds the maximum reward
        if (!reward) {
            console.log('The total airdrop amount is exceeded the limitation');
            const response = createResponse(10032, 'The total airdrop amount is exceeded the limitation', { reward });
            return res.json(response);
        }

        const data = {
            address: parentAddress,
            amount: appendAmount,
        };

        // Endpoint: /append_airdrop
        const response = await fetch(airdropRewardAddress, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        const responseData = await response.json();
        const logAirdropAmount = responseData.data.airdrop_count;

        console.log('Airdrop checking response:', logAirdropAmount);
        // Second check: Do not log the airdrop amount to parent user if it exceeds the maximum reward
        if (logAirdropAmount > maxReward) {
            console.log('The total airdrop amount is exceeded the limitation:', logAirdropAmount);
            // Note: Do not encapsulate this response in the createResponse function
            return res.json(responseData);
        }

        const { totalRewardAmount: rewardAmount } = await utils.appendRewardParentUser(parentAddress, logAirdropAmount);
        console.log('Parent rewarded successfully:', rewardAmount);

        // Return the response from the airdrop API
        // Note: Do not encapsulate this response in the createResponse function
        res.json(responseData);
    } catch (error) {
        console.error('Error in handling the request:', error);
        const response = createResponse(error.code || 10000, error.message);
        res.status(500).json(response);
    }
});
app.options('/send-airdrop-parent', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /check-purchase:
 *   get:
 *     summary: Check if a specific address has purchased the first generation of $Lotso tokens
 *     description: This endpoint allows the authenticated user to check if a specific address has purchased the first generation of $Lotso tokens.
 *     parameters:
 *       - in: query
 *         name: address
 *         schema:
 *           type: string
 *         required: true
 *         description: The address to check the purchase for
 *     responses:
 *       200:
 *         description: Returns the purchase status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     purchased:
 *                       type: boolean
 *       400:
 *         description: No session found or address not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: The user is not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue with the Twitter API or while checking the purchase
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/check-purchase', async (req, res) => {
    if (!req.session) {
        const response = createResponse(10003, 'No session found');
        return res.status(400).json(response);
    }
    console.log("Endpoint hit: /check-purchase");

    if (!req.session.accessToken || !req.session.accessTokenSecret) {
        const response = createResponse(10002, 'Authentication required');
        return res.status(401).json(response);
    }

    const { address } = req.query;
    if (!address) {
        console.log("Address not found");
        const response = createResponse(10004, 'Address is required');
        return res.status(400).json(response);
    }

    try {
        // Check if the user address has purchased the first generation of $Lotso tokens
        const result = await utils.checkIfPurchased(address);
        const response = createResponse(0, 'Success', result);
        res.json(response);
    } catch (error) {
        console.error("Failed to check purchase:", error);
        const response = createResponse(error.code || 10000, error.message);
        res.status(500).json(response);
    }
});
app.options('/check-purchase', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /check-reward-amount:
 *   get:
 *     summary: Check reward amount for a specific address
 *     description: This endpoint allows the authenticated user to check the reward amount for a specific address.
 *     parameters:
 *       - in: query
 *         name: address
 *         schema:
 *           type: string
 *         required: true
 *         description: The address to check the reward amount for
 *     responses:
 *       200:
 *         description: Returns the reward amount
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     reward_amount:
 *                       type: integer
 *       400:
 *         description: Address not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue while checking the reward amount
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/check-reward-amount', async (req, res) => {
    const { address } = req.query;
    if (!address) {
        console.log("Address not found");
        const response = createResponse(10004, 'Address is required');
        return res.status(400).json(response);
    }

    try {
        // Check the reward amount for the user
        const result = await utils.checkRewardAmount(address);
        const response = createResponse(0, 'Success', result);
        res.json(response);
    } catch (error) {
        console.error("Failed to check reward amount:", error);
        const response = createResponse(error.code || 10000, error.message);
        res.status(500).json(response);
    }
});
app.options('/check-reward-amount', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /subscription-info:
 *   get:
 *     summary: Log subscription information for a user
 *     description: This endpoint allows the authenticated user to log subscription information for a user.
 *     parameters:
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         required: true
 *         description: The email of the user
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         required: false
 *         description: The name of the user
 *       - in: query
 *         name: info
 *         schema:
 *           type: string
 *         required: false
 *         description: Additional subscription information
 *     responses:
 *       200:
 *         description: Returns the result of the logging operation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: Email not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Returns an error if there's an issue while logging the subscription information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/subscription-info', async (req, res) => {
    console.log("Endpoint hit: /subscription-info");

    const { name, email, info } = req.query;
    if (!email) {
        console.log("Email not found");
        const response = createResponse(10040, 'Email is required');
        return res.status(400).json(response);
    }

    try {
        // Log the subscription info
        const result = await utils.logSubscriptionInfo(email, name, info);
        const response = createResponse(0, 'Success', result);
        res.json(response);
    } catch (error) {
        console.error("Failed to log subscription info:", error);
        const response = createResponse(error.code || 10000, error.message);
        res.status(500).json(response);
    }
});
app.options('/subscription-info', cors(corsOptions)); // Enable preflight request for this endpoint

/**
 * @swagger
 * /v1/info/recipient_info:
 *   get:
 *     summary: Get recipient information
 *     description: This endpoint retrieves recipient information from a specified address.
 *     responses:
 *       200:
 *         description: Returns the recipient information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       500:
 *         description: Returns an error if there's an issue while retrieving the recipient information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 */
app.get('/v1/info/recipient_info', async (req, res) => {
    console.log("Endpoint hit: /v1/info/recipient_info");

    try {
        // Endpoint: /recipient_info
        const response = await fetch(recipientCheckAddress);
        const data = await response.json();
        //console.log('recipient_info checking response:', data);
        res.json(data);
    } catch (error) {
        console.error("Failed to get recipients count:", error);
        const response = createResponse(10036, error.message);
        res.status(500).json(response);
    }
});
app.options('/v1/info/recipient_info', cors(corsOptions)); // Enable preflight request for this endpoint

const SERVER_PORT = process.env.SERVER_PORT || 5000;
const keyPath = process.env.PRIVKEY_PATH;
const certPath = process.env.CERT_PATH;

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.error('Required certificate files not found. Exiting...');
    process.exit(1);
}

module.exports = {
    SERVER_PORT,
    server: https.createServer({
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
    }, app),
};
