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
                            body: JSON.stringify({
                                status: 'failure',
                                error: error
                            })
                        });
                    } else {
                        // You should securely store these tokens and associate them with the user's session
                        // For now, we'll send them back to the frontend (but this is not recommended in production!)
                        resolve({
                            statusCode: 200,
                            body: JSON.stringify({
                                status: 'success',
                                accessToken: accessToken,
                                accessTokenSecret: accessTokenSecret
                            })
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

    // Handle the bookmark request
    else if (event.path === '/bookmark') {
        const { accessToken, accessTokenSecret, tweetId } = event.queryStringParameters;
        return bookmarkTweet(accessToken, accessTokenSecret, tweetId);
    }

    // Handle the follow request
    else if (event.path === '/follow') {
        const { accessToken, accessTokenSecret, userId } = event.queryStringParameters;
        return followUser(accessToken, accessTokenSecret, userId);
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
            return {
                error: true, 
                statusCode: error.statusCode || 500, 
                message: error.message || 'Internal Server Error' 
            };
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
            return {
                error: true,
                statusCode: error.statusCode || 500,
                message: error.message || 'Internal Server Error'
            };
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
            return {
                error: true,
                statusCode: error.statusCode || 500,
                message: error.message || 'Internal Server Error'
            };
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
            return { 
                error: true, 
                statusCode: error.statusCode || 500, 
                message: error.message || "Internal Server Error" 
            };
        });
}

