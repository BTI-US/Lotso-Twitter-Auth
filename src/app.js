const OAuth = require('oauth').OAuth;

exports.handler = async (event, context) => {
    const consumerKey = process.env.TWITTER_CONSUMER_KEY;
    const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;
    // Extract callback URL from query parameters
    const callbackUrl = decodeURIComponent(event.queryStringParameters.callback);

    const oauth = new OAuth(
        'https://api.twitter.com/oauth/request_token',
        'https://api.twitter.com/oauth/access_token',
        consumerKey,
        consumerSecret,
        '1.0A',
        callbackUrl, // Dynamically set the callback URL
        'HMAC-SHA1'
    );

    // Initiate the OAuth process and redirect to Twitter
    if (event.path === '/start-auth') {
        return new Promise((resolve, reject) => {
            oauth.getOAuthRequestToken((error, oauthToken, oauthTokenSecret, results) => {
                if (error) {
                    resolve({
                        statusCode: 500,
                        body: JSON.stringify(error)
                    });
                } else {
                    // Redirect user to Twitter for authorization
                    const url = `https://api.twitter.com/oauth/authenticate?oauth_token=${oauthToken}`;
                    resolve({
                        statusCode: 302,
                        headers: { Location: url },
                        body: ''
                    });
                }
            });
        });
    }

    // Handle the callback from Twitter
    else if (event.path === '/callback') {
        const oauthToken = event.queryStringParameters.oauth_token;
        const oauthVerifier = event.queryStringParameters.oauth_verifier;

        return new Promise((resolve, reject) => {
            oauth.getOAuthAccessToken(
                oauthToken,
                null, // token secret is not needed here
                oauthVerifier,
                (error, accessToken, accessTokenSecret, results) => {
                    if (error) {
                        resolve({
                            statusCode: 500,
                            body: JSON.stringify(error)
                        });
                    } else {
                        // You should securely store these tokens and associate them with the user's session
                        // For now, we'll send them back to the frontend (but this is not recommended in production!)
                        resolve({
                            statusCode: 200,
                            body: JSON.stringify({ accessToken, accessTokenSecret })
                        });
                    }
                }
            );
        });
    }

    // Handle the retweet request
    else if (event.path === '/retweet') {
        const { accessToken, accessTokenSecret, tweetId } = event.queryStringParameters;
        return retweetTweet(accessToken, accessTokenSecret, tweetId);
    }

    // Handle the like request
    else if (event.path === '/like') {
        const { accessToken, accessTokenSecret, tweetId } = event.queryStringParameters;
        return likeTweet(accessToken, accessTokenSecret, tweetId);
    }

    // Handle the share request
    else if (event.path === '/share') {
        const { accessToken, accessTokenSecret, tweetId, recipientId } = event.queryStringParameters;
        return shareTweet(accessToken, accessTokenSecret, tweetId, recipientId);
    }
};

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
    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url);
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
    const url = `https://api.twitter.com/2/users/${process.env.TWITTER_USER_ID}/likes`;
    const body = JSON.stringify({ tweet_id: tweetId });
    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body);
}

/**
 * @brief Shares a tweet with a recipient on Twitter.
 * 
 * @param {string} accessToken - The access token for authenticating the request.
 * @param {string} accessTokenSecret - The access token secret for authenticating the request.
 * @param {string} tweetId - The ID of the tweet to share.
 * @param {string} recipientId - The ID of the recipient user.
 * 
 * @return {Promise} A promise that resolves to the response of the API request.
 * 
 * @note This function makes an authenticated request to the Twitter API to send a direct message
 *       containing a link to the specified tweet to the recipient user.
 */
function shareTweet(accessToken, accessTokenSecret, tweetId, recipientId) {
    const url = `https://api.twitter.com/2/users/${recipientId}/messages`;
    const messageContent = `Check out this tweet: https://twitter.com/i/web/status/${tweetId}`;
    const body = JSON.stringify({
        message_create: {
            target: { recipient_id: recipientId },
            message_data: { text: messageContent }
        }
    });
    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body);
}
