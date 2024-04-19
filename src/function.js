const { OAuth } = require('oauth');
const mongoUtil = require('./db');

let dbConnection = null;
let userDbConnection = null;

mongoUtil.connectToServer()
    .then(({ dbConnection: localDbConnection, userDbConnection: localUserDbConnection }) => {
        console.log("Successfully connected to MongoDB.");
        // Create index on 'twitterInteractions' after ensuring the database connection is established
        localUserDbConnection.collection('twitterInteractions').createIndex({ userId: 1, type: 1 }, { unique: true })
            .then(() => {
                console.log("Index created successfully on 'twitterInteractions'");
                // Proceed to create index on 'airdropClaim'
                return localUserDbConnection.collection('airdropClaim').createIndex({ userId: 1, userAddress: 1, createdAt: -1 }, { unique: false });
            })
            .then(() => {
                console.log("Index created successfully on 'airdropClaim'");
                // Assign the database connections to the variables declared at higher scope
                dbConnection = localDbConnection;
                userDbConnection = localUserDbConnection;
            })
            .catch(err => console.error("Error creating index:", err));
    })
    .catch(err => {
        console.error("Failed to connect to MongoDB:", err);
    });

/**
 * Logs interactions with the Twitter API to MongoDB.
 * @param {string} type - The type of interaction (e.g., 'follow', 'like').
 * @param {string} url - The API endpoint URL.
 * @param {Object} requestBody - The body of the request.
 * @param {Object|null} response - The API response, if successful.
 * @param {Error|null} error - The error, if the request failed.
 */
async function logTwitterInteraction(type, url, requestBody, response = null, error = null) {
    if (!dbConnection) {
        throw new Error("Database not connected");
    }

    const logEntry = {
        type,
        url,
        requestBody,
        createdAt: new Date(),
    };

    // Add response or error information to the log entry depending on the outcome
    if (response) {
        logEntry.response = response;
    } else if (error) {
        logEntry.error = error.toString();
    }

    await dbConnection.collection('twitterInteractions').insertOne(logEntry);
}

/**
 * @brief Logs a user interaction with the Twitter API to the user database.
 * 
 * @param {string} userId - The ID of the user performing the interaction.
 * @param {string} type - The type of interaction (e.g., 'follow', 'like').
 * @param {string} url - The API endpoint URL.
 * @param {Object} requestBody - The body of the request.
 * @param {Object|null} [response=null] - The API response, if successful.
 * @param {Error|null} [error=null] - The error, if the request failed.
 * 
 * @note This function logs a user interaction with the Twitter API to the user database.
 * If the user database is not connected, an error will be thrown.
 */
async function logUserInteraction(userId, type, url, requestBody, response = null, error = null) {
    if (!userDbConnection) {
        throw new Error("User database not connected");
    }

    const logEntry = {
        userId, // Including userId in the log entry
        type,
        url,
        requestBody,
        createdAt: new Date(),
    };

    if (response) {
        logEntry.response = response;
    } else if (error) {
        logEntry.error = error.toString();
    }

    // Define a filter to find the existing log entry for this user and type
    const filter = { userId, type };

    // Define the update operation to set the new log data
    const update = {
        $set: logEntry,
    };

    // Use the userDb to update the interaction log, or insert a new one if it does not exist
    await userDbConnection.collection('twitterInteractions').updateOne(filter, update, { upsert: true });
}

/**
 * @brief Queries the user interaction log for the latest log entry of a specific user and interaction type.
 * 
 * @param {string} userId - The ID of the user.
 * @param {string} type - The type of interaction (e.g., 'follow', 'like').
 * 
 * @return {Promise<Object|null>} A promise that resolves with the latest log entry, or null if no entry is found.
 * 
 * @note This function queries the user interaction log in the user database to fetch the latest log entry
 * for a specific user and interaction type. If the user database is not connected, an error will be thrown.
 * The log entry is returned as an object, or null if no entry is found.
 */
async function checkInteraction(userId, type) {
    if (!userDbConnection) {
        throw new Error("User database not connected");
    }

    try {
        // Define the query to find the latest log entry for this user and type
        const query = { userId, type };
        const options = {
            sort: { createdAt: -1 },  // Sort by creation date in descending order to get the most recent log
            limit: 1,  // Limit the result to only one document
        };

        // Execute the query to fetch the latest log entry
        const logEntry = await userDbConnection.collection('twitterInteractions').findOne(query, options);

        if (logEntry) {
            // Check if the interaction was successful based on the existence of a response and absence of an error
            return !!logEntry.response && !logEntry.error;
        } else {
            console.log("No interaction found for this user and type.");
            return false;  // Return false if no entry is found
        }
    } catch (error) {
        console.error("Error checking interaction:", error);
        return false;  // Return false in case of an error during the query
    }
}

/**
 * @brief Checks if a user has already claimed the airdrop.
 * 
 * @param {string} userId - The ID of the user.
 * @param {string} userAddress - The address of the user.
 * 
 * @return {Promise<Object>} A promise that resolves with an object indicating whether the user has claimed the airdrop.
 * The resolved object has a property 'hasClaimed' which is a boolean value indicating whether the user has claimed the airdrop.
 * 
 * @note This function checks if a user has already claimed the airdrop by querying the 'airdropClaim' collection in the user database.
 * If the user database is not connected, an error will be thrown.
 * The function executes a query to find a matching entry in the 'airdropClaim' collection based on the provided 'userId' and 'userAddress'.
 * If a matching entry is found, the function returns an object with 'hasClaimed' set to true.
 * If no matching entry is found, the function returns an object with 'hasClaimed' set to false.
 * If there is an error during the process, the error will be logged and rethrown to be handled in the calling function.
 */
async function checkIfClaimedAirdrop(userId, userAddress) {
    if (!userDbConnection) {
        throw new Error("User database not connected");
    }

    try {
        // Define the query to find a matching entry in the airdropClaim collection
        const query = { userId, userAddress };
        const options = {
            sort: { createdAt: -1 },  // Sort by creation date in descending order to get the most recent log
            limit: 1,  // Limit the result to only one document
        };

        // Execute the query to fetch a matching entry
        const airdropEntry = await userDbConnection.collection('airdropClaim').findOne(query, options);

        if (airdropEntry) {
            console.log("User has already claimed the airdrop.");
            return { hasClaimed: true };
        } else {
            console.log("User has not claimed the airdrop yet.");
            return { hasClaimed: false };
        }
    } catch (error) {
        console.error("Error checking if claimed airdrop:", error);
        throw error;  // Rethrow the error to handle it in the calling function
    }
}

/**
 * @brief Logs a user's airdrop claim to the user database.
 * 
 * @param {string} userId - The ID of the user claiming the airdrop.
 * @param {string} userAddress - The address of the user claiming the airdrop.
 * 
 * @return {Promise<Object>} A promise that resolves with an object indicating whether the airdrop claim was successfully logged.
 * The resolved object has a property 'isLogged' which is a boolean value indicating whether the claim was logged.
 * 
 * @note This function logs a user's airdrop claim to the user database. If the user database is not connected, an error will be thrown.
 * The function checks if any address has been logged for the provided userId. If no address has been logged, the userAddress is added to the log entry.
 * The log entry is then inserted into the 'airdropClaim' collection in the user database.
 * If an address has already been logged for the userId, the userAddress is not added to the log entry.
 * The function returns an object indicating whether the claim was successfully logged, with 'isLogged' set to true if the claim was logged,
 * or false if the claim was not logged due to a previous log entry for the userId.
 */
async function logUserAirdrop(userId, userAddress) {
    if (!userDbConnection) {
        throw new Error("User database not connected");
    }

    // Check if any address has been logged for this userId
    const existingEntry = await userDbConnection.collection('airdropClaim').findOne({ userId });

    // Prepare the log entry data
    const logEntry = {
        userId,
        loggedAt: new Date(),
    };

    // Only add the userAddress to the log entry if no address has been logged for this userId before
    if (!existingEntry) {
        logEntry.userAddress = userAddress; // Log the address only if this user hasn't logged any address before
        // Log the interaction to the database
        await userDbConnection.collection('airdropClaim').insertOne(logEntry);
        console.log(`Airdrop logged for userId: ${userId} with address: ${userAddress}`);

        return { isLogged: true };
    } else {
        // Log the interaction to the database
        await userDbConnection.collection('airdropClaim').insertOne(logEntry);
        console.log(`Airdrop re-logged for userId: ${userId}, address not repeated due to previous log.`);

        return { isLogged: false };
    }
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
            'HMAC-SHA1',
        );

        // Convert method to lowercase for consistent comparison
        const lowerCaseMethod = method.toLowerCase();

        const callback = (error, data, response) => {
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
        };

        // Determine the method to use based on 'method' argument
        if (lowerCaseMethod === 'post') {
            oauth.post(
                url,
                accessToken,
                accessTokenSecret,
                body,  // Body is used only for POST requests
                'application/json',  // Content type for POST requests
                callback,
            );
        } else if (lowerCaseMethod === 'get') {
            oauth.get(
                url,
                accessToken,
                accessTokenSecret,
                callback,
            );
        } else {
            reject(new Error("Unsupported method type provided."));
        }
    });
}

/**
 * @brief Retrieves the Twitter user ID using the provided access token and access token secret.
 * 
 * @param {string} accessToken - The OAuth access token.
 * @param {string} accessTokenSecret - The OAuth access token secret.
 * @return {Promise<string>} - A promise that resolves with the string version of the user's ID.
 * @note This function requires the 'OAuth' library and the 'TWITTER_CONSUMER_KEY' and 'TWITTER_CONSUMER_SECRET' environment variables to be set.
 */
function getUserTwitterId(accessToken, accessTokenSecret) {
    const url = 'https://api.twitter.com/1.1/account/verify_credentials.json';

    // Using the modified makeAuthenticatedRequest to handle the GET request
    return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url)
        .then(parsedData => {
            console.log("Parsed data:", parsedData);
            return parsedData.id_str;  // Returns the string version of the user's ID
        })
        .catch(error => {
            console.error("Error fetching or parsing data:", error);
            throw error;  // Rethrow to maintain error chain
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

    // Return the promise chain to ensure that calling functions can handle the response
    return checkInteraction(userId, 'retweet')
        .then(interactionExists => {
            if (interactionExists) {
                console.log("User has already retweeted this tweet.");
                // Return an object wrapped in a Promise to keep consistent promise-based flow
                return Promise.resolve({ statusCode: 200, message: "User has already retweeted this tweet." });
            }
            // Proceed to make the retweet request if the tweet has not been retweeted by the user
            return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body)
                .then(async response => {
                    if (response.errors) {
                        const errorDetails = response.errors[0];
                        console.error(`Failed to retweet tweet, Error: ${errorDetails.detail}`);
                        // Throw an error to be caught by the outer catch
                        throw new Error(`Failed to retweet tweet, Error: ${errorDetails.detail}`);
                    }
                    // Log the successful API request
                    await logUserInteraction(userId, 'retweet', url, body, response);
                    await logTwitterInteraction('retweet', url, body, response);
                    return response;  // Return the successful response object
                });
        })
        .catch(async error => {
            // Handle both errors from checkInteraction and makeAuthenticatedRequest
            await logTwitterInteraction('retweet', url, body, null, error);
            console.error('Failed to retweet tweet:', error);
            // Rethrow the error to ensure it can be handled by the caller
            throw error;
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

    // First, check if the user has already liked the tweet
    return checkInteraction(userId, 'like')
        .then(interactionExists => {
            if (interactionExists) {
                console.log("User has already liked this tweet.");
                // Return an object wrapped in a Promise to keep consistent promise-based flow
                return Promise.resolve({ statusCode: 200, message: "User has already liked this tweet." });
            }
            // Proceed to make the like request if the tweet has not been liked by the user
            return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body)
                .then(async response => {
                    if (response.errors) {
                        const errorDetails = response.errors[0];
                        console.error(`Failed to like tweet, Error: ${errorDetails.detail}`);
                        // Throw an error to be caught by the outer catch
                        throw new Error(`Failed to like tweet, Error: ${errorDetails.detail}`);
                    }
                    // Log the successful API request
                    await logUserInteraction(userId, 'like', url, body, response);
                    await logTwitterInteraction('like', url, body, response);
                    return response;  // Return the successful response object
                });
        })
        .catch(async error => {
            // Handle both errors from checkInteraction and makeAuthenticatedRequest
            await logTwitterInteraction('like', url, body, null, error);
            console.error('Failed to like tweet:', error);
            // Rethrow the error to ensure it can be handled by the caller
            throw error;
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

    // First, check if the user has already bookmarked the tweet
    return checkInteraction(userId, 'bookmark')
        .then(interactionExists => {
            if (interactionExists) {
                console.log("User has already bookmarked this tweet.");
                // Return an object wrapped in a Promise to keep consistent promise-based flow
                return Promise.resolve({ statusCode: 200, message: "User has already bookmarked this tweet." });
            }
            // Proceed to make the bookmark request if the tweet has not been bookmarked by the user
            return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body)
                .then(async response => {
                    if (response.errors) {
                        const errorDetails = response.errors[0];
                        console.error(`Failed to bookmark tweet, Error: ${errorDetails.detail}`);
                        // Throw an error to be caught by the outer catch
                        throw new Error(`Failed to bookmark tweet, Error: ${errorDetails.detail}`);
                    }
                    // Log the successful API request
                    await logUserInteraction(userId, 'bookmark', url, body, response);
                    await logTwitterInteraction('bookmark', url, body, response);
                    return response;  // Return the successful response object
                });
        })
        .catch(async error => {
            // Handle both errors from checkInteraction and makeAuthenticatedRequest
            await logTwitterInteraction('bookmark', url, body, null, error);
            console.error('Failed to bookmark tweet:', error);
            // Rethrow the error to ensure it can be handled by the caller
            throw error;
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
        .then(async response => {
            if (response.errors) {
                // If Twitter API returns errors, handle them here
                const errorDetails = response.errors[0];
                console.error(`Failed to fetch user ID, Error: ${errorDetails.detail}`);
                throw new Error(`Failed to fetch user ID, Error: ${errorDetails.detail}`);
            } else {
                // Log the successful API request
                await logTwitterInteraction('fetchUserId', url, null, response);
            }
            console.log("Fetched user ID: ", response.data.id);
            return response.data.id;
        })
        .catch(async error => {
            // Log the failed API request
            await logTwitterInteraction('fetchUserId', url, null, null, error);

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

    // First, check if the user has already followed the target user
    return checkInteraction(userId, 'follow')
        .then(interactionExists => {
            if (interactionExists) {
                console.log("User has already followed this target user.");
                // Return an object wrapped in a Promise to keep consistent promise-based flow
                return Promise.resolve({ statusCode: 200, message: "User has already followed this target user." });
            }
            // Proceed to make the follow request if the user has not followed the target user yet
            return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body)
                .then(async response => {
                    if (response.errors) {
                        const errorDetails = response.errors[0];
                        console.error(`Failed to follow user, Error: ${errorDetails.detail}`);
                        // Throw an error to be caught by the outer catch
                        throw new Error(`Failed to follow user, Error: ${errorDetails.detail}`);
                    }
                    // Log the successful API request
                    await logUserInteraction(userId, 'follow', url, body, response);
                    await logTwitterInteraction('follow', url, body, response);
                    return response;  // Return the successful response JSON
                });
        })
        .catch(async error => {
            // Handle both errors from checkInteraction and makeAuthenticatedRequest
            await logTwitterInteraction('follow', url, body, null, error);
            console.error('Failed to follow user:', error);
            // Rethrow the error to ensure it can be handled by the caller
            throw error;
        });
}

/**
 * @brief Checks if a tweet has been retweeted by the user.
 * 
 * @param {string} accessToken - The access token for authenticating the request.
 * @param {string} accessTokenSecret - The access token secret for authenticating the request.
 * @param {string} userId - The ID of the user to check for retweets.
 * @param {string} targetTweetId - The ID of the tweet to check if retweeted.
 * 
 * @return {Promise<{retweeted: boolean}>} - A promise that resolves to an object containing the retweeted status.
 * 
 * @note This function makes an authenticated request to the Twitter API to fetch the user's timeline tweets
 * and checks if any tweet is a retweet of the specified tweetId.
 * If an error occurs during the process, it will be logged and rethrown to be handled by the caller.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/tweets/timelines/api-reference/get-users-id-tweets
 * Limitation: 15 requests / 15 mins per user or 15 requests / 15 mins per app, no tweet cap
 */
function checkIfRetweeted(accessToken, accessTokenSecret, userId, targetTweetId) {
    // First, check if there is a logged interaction indicating that the user has already retweeted the target tweet
    return checkInteraction(userId, 'checkRetweet')
        .then(hasRetweeted => {
            if (hasRetweeted) {
                console.log("User has already performed this retweet check with success.");
                return { isRetweeted: true };
            } else {
                // If not already retweeted according to logs, check Twitter API to ensure and log new interactions
                const url = `https://api.twitter.com/2/tweets/${targetTweetId}/retweeted_by`;
                return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url)
                    .then(async response => {
                        // Log the successful API request
                        await logTwitterInteraction('checkRetweet', url, null, response);

                        if (response.data && response.data.length > 0) {
                            // Check through the list of tweets to see if targetTweetId is one of them
                            const isRetweeted = response.data.some(tweet => tweet.id === userId);
                            await logUserInteraction(userId, 'checkRetweet', url, null, response);
                            await logTwitterInteraction('checkRetweet', url, null, response);
                            return { isRetweeted };
                        } else {
                            // If the data array is empty, then no tweets were found
                            return { isRetweeted: false };
                        }
                    });
            }
        })
        .catch(async error => {
            // Log the failed API request or interaction check
            await logTwitterInteraction('checkRetweet', url, null, null, error);
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
    // First, check if there is a logged interaction indicating that the user is following the target user
    return checkInteraction(userId, 'checkFollow')
        .then(hasFollowed => {
            if (hasFollowed) {
                console.log("User has already performed this follow check with success.");
                return { isFollowing: true };
            } else {
                // If not already following according to logs, fetch current following list from Twitter API
                const url = `https://api.twitter.com/2/users/${userId}/following`;
                return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url)
                    .then(async response => {
                        // Log the successful API request
                        await logTwitterInteraction('checkFollow', url, null, response);

                        if (response.data && response.data.length > 0) {
                            // Check through the list of followed users to see if targetUserId is one of them
                            const isFollowing = response.data.some(user => user.id === targetUserId);
                            await logUserInteraction(userId, 'checkFollow', url, null, response);
                            await logTwitterInteraction('checkFollow', url, null, response);
                            return { isFollowing };
                        } else {
                            // If the data array is empty, then the user is not following anyone or the specified userId is invalid
                            return { isFollowing: false };
                        }
                    });
            }
        })
        .catch(async error => {
            // Log the failed API request or interaction check
            await logTwitterInteraction('checkFollow', url, null, null, error);
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
    // First, check if there is a logged interaction indicating that the user has already liked the target tweet
    return checkInteraction(userId, 'checkLike')
        .then(hasLiked => {
            if (hasLiked) {
                console.log("User has already performed this like check with success.");
                return { isLiked: true };
            } else {
                // If not already liked according to logs, fetch the current liked tweets from Twitter API
                const url = `https://api.twitter.com/2/users/${userId}/liked_tweets`;
                return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url)
                    .then(async response => {
                        // Log the successful API request
                        await logTwitterInteraction('checkLike', url, null, response);

                        if (response.data && response.data.length > 0) {
                            // Check through the list of liked tweets to see if targetTweetId is one of them
                            const isLiked = response.data.some(tweet => tweet.id === targetTweetId);
                            await logUserInteraction(userId, 'checkLike', url, null, response);
                            await logTwitterInteraction('checkLike', url, null, response);
                            return { isLiked };
                        } else {
                            // If the data array is empty, then no tweets were found
                            return { isLiked: false };
                        }
                    });
            }
        })
        .catch(async error => {
            // Log the failed API request or interaction check
            await logTwitterInteraction('checkLike', url, null, null, error);
            console.error('Error checking if liked:', error);
            throw error;  // Rethrow error to be handled by the caller
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
    // First, check if there is a logged interaction indicating that the user has already bookmarked the target tweet
    return checkInteraction(userId, 'checkBookmark')
        .then(hasBookmarked => {
            if (hasBookmarked) {
                console.log("User has already performed this bookmark check with success.");
                return { isBookmarked: true };
            } else {
                // If not already bookmarked according to logs, fetch the current bookmarks from Twitter API
                const url = `https://api.twitter.com/2/users/${userId}/bookmarks`;
                return makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url)
                    .then(async response => {
                        // Log the successful API request
                        await logTwitterInteraction('checkBookmark', url, null, response);

                        if (response.data && response.data.length > 0) {
                            // Check through the list of bookmarks to see if targetTweetId is one of them
                            const isBookmarked = response.data.some(tweet => tweet.id === targetTweetId);
                            await logUserInteraction(userId, 'checkBookmark', url, null, response);
                            await logTwitterInteraction('checkBookmark', url, null, response);
                            return { isBookmarked };
                        } else {
                            // If the data array is empty, then no bookmarks were found
                            return { isBookmarked: false };
                        }
                    });
            }
        })
        .catch(async error => {
            // Log the failed API request or interaction check
            await logTwitterInteraction('checkBookmark', url, null, null, error);
            console.error('Error checking if bookmarked:', error);
            throw error;  // Rethrow error to be handled by the caller
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
    checkIfClaimedAirdrop,
    logUserAirdrop,
};
