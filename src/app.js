const OAuth = require('oauth').OAuth;
const Twitter = require('twitter');

/**
 * Checks if any of the tweets contains the specified content.
 * @param {Array} tweets - Array of tweet objects from the Twitter API.
 * @param {String} content - The specific content to search for.
 * @returns {Boolean} - Returns true if any tweet contains the content.
 */
function checkTweetContent(tweets, content) {
    return tweets.some(tweet => tweet.text.includes(content));
}

/**
 * Fetches tweets from a user's timeline.
 * @param {string} accessToken - The access token for Twitter API.
 * @param {string} accessTokenSecret - The access token secret for Twitter API.
 * @returns {Promise<Array>} - A promise that resolves to an array of tweets.
 */
async function getTweets(accessToken, accessTokenSecret) {
    const client = new Twitter({
        consumer_key: process.env.TWITTER_CONSUMER_KEY,
        consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
        access_token_key: accessToken,
        access_token_secret: accessTokenSecret
    });

    try {
        const params = { count: 10 }; // Retrieve the last 10 tweets
        const tweets = await client.get('statuses/user_timeline', params);
        return tweets;
    } catch (error) {
        console.error('Error fetching tweets:', error);
        throw error; // Re-throw the error for handling upstream
    }
}

exports.handler = async (event, context) => {
    const consumerKey = process.env.TWITTER_CONSUMER_KEY;
    const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;

    const oauth = new OAuth(
        'https://api.twitter.com/oauth/request_token',
        'https://api.twitter.com/oauth/access_token',
        consumerKey,
        consumerSecret,
        '1.0A',
        'YOUR_FRONTEND_CALLBACK_URL', // This should be the URL of your frontend
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

    // Check if the user has tweeted specific content
    else if (event.path === '/check-tweets') {
        // In a real-world scenario, you'd retrieve the access tokens from a secure storage, linked to the user's session
        const accessToken = event.queryStringParameters.accessToken;
        const accessTokenSecret = event.queryStringParameters.accessTokenSecret;

        try {
            const tweets = await getTweets(accessToken, accessTokenSecret);
            const hasTweeted = checkTweetContent(tweets, 'SPECIFIC_CONTENT');
            return { statusCode: 200, body: JSON.stringify({ hasTweeted }) };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify(error) };
        }
    }
};
