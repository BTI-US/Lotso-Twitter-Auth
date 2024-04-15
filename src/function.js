const { OAuth } = require('oauth');

/**
 * @brief Retrieves the Twitter user ID using the provided access token and access token secret.
 * 
 * @param {string} accessToken - The OAuth access token.
 * @param {string} accessTokenSecret - The OAuth access token secret.
 * @return {Promise<string>} - A promise that resolves with the string version of the user's ID.
 * @note This function requires the 'OAuth' library and the 'TWITTER_CONSUMER_KEY' and 'TWITTER_CONSUMER_SECRET' environment variables to be set.
 */
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

module.exports = {
    getUserTwitterId,
    makeAuthenticatedRequest,
    retweetTweet,
    likeTweet,
    bookmarkTweet,
    fetchUserId,
    followUser,
    checkIfRetweeted,
    checkIfFollowed,
    checkIfLiked,
    checkIfBookmarked,
};
