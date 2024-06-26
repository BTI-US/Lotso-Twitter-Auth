const { OAuth } = require('oauth');
const { getDbConnections } = require('./dbConnection');

const airdropCheckAddress = `http://${process.env.AIRDROP_SERVER_HOST}:${process.env.AIRDROP_SERVER_PORT}/v1/info/check_eligibility`;

let dbConnection;
let userDbConnection;

getDbConnections().then(connections => {
    dbConnection = connections.dbConnection;
    userDbConnection = connections.userDbConnection;
}).catch(err => {
    console.error('Failed to get database connections:', err);
    process.exit(1);
});

/**
 * Logs interactions with the Twitter API to MongoDB.
 * @param {string} userId - The ID of the user performing the interaction.
 * @param {string} type - The type of interaction (e.g., 'follow', 'like').
 * @param {string} url - The API endpoint URL.
 * @param {Object|null} requestBody - The body of the request.
 * @param {Object|null} response - The API response, if successful.
 * @param {Error|null} error - The error, if the request failed.
 */
async function logTwitterInteraction(userId, type, url, requestBody, response = null, error = null) {
    if (!dbConnection) {
        throw new Error("Database not connected");
    }

    const logEntry = {
        userId,
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
 * @param {string} targetId - The ID of the target user or tweet.
 * @param {string} type - The type of interaction (e.g., 'follow', 'like').
 * @param {string} url - The API endpoint URL.
 * @param {Object|null} requestBody - The body of the request.
 * @param {Object|null} [response=null] - The API response, if successful.
 * @param {Error|null} [error=null] - The error, if the request failed.
 * 
 * @note This function logs a user interaction with the Twitter API to the user database.
 * If the user database is not connected, an error will be thrown.
 */
async function logUserInteraction(userId, targetId, type, url, requestBody, response = null, error = null) {
    if (!userDbConnection) {
        throw new Error("User database not connected");
    }

    const logEntry = {
        userId,
        targetId,
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
    const filter = { userId, targetId, type };

    // Define the update operation to set the new log data
    const update = {
        $set: logEntry,
    };

    // Use the userDb to update the interaction log, or insert a new one if it does not exist
    await userDbConnection.collection('twitterInteractions').updateOne(filter, update, { upsert: true });
}

/**
 * @brief Checks if a user has completed specific check steps and met certain criteria.
 * 
 * @param {string} userId - The ID of the user to check.
 * @param {string[]} requiredTypes - An array of required interaction types.
 * 
 * @return {boolean} - Returns true if the user has completed all required steps and met the criteria, otherwise false.
 * @throws {Error} - If there is an error while checking the user interactions.
 * @note This function assumes that the userDbConnection is already established and connected to the user database.
 * The function checks if the user has completed all the required interaction types specified in the 'requiredTypes' array.
 * It also checks if the user has performed multiple occurrences of the same interaction type specified in the 'sameType' parameter.
 * If the user has completed all the required steps and met the criteria, the function returns true.
 * Otherwise, it returns false.
 */
async function checkUserSteps(userId, requiredTypes) {
    try {
        if (!userDbConnection) {
            console.error("User database not connected");
            throw new Error("User database not connected");
        }
    
        // Query the database for unique types for the specific user
        const typesResult = await userDbConnection.collection('twitterInteractions').distinct('type', { userId });
        
        // Check if all required types are present in the result
        const hasAllTypes = requiredTypes.every(type => typesResult.includes(type));

        if (sameType === null) {
            return hasAllTypes;
        }
    } catch (error) {
        console.error("Error checking user interactions:", error);
        throw new Error("Error checking user interactions");
    }
}

/**
 * @brief Queries the user interaction log for the latest log entry of a specific user and interaction type.
 * 
 * @param {string} userId - The ID of the user.
 * @param {string} type - The type of interaction (e.g., 'follow', 'like').
 * @param {string} targetId - (Optional) The ID of the target user or tweet.
 * 
 * @return {Promise<Object|null>} A promise that resolves with the latest log entry, or null if no entry is found.
 * 
 * @note This function queries the user interaction log in the user database to fetch the latest log entry
 * for a specific user and interaction type. If the user database is not connected, an error will be thrown.
 * The log entry is returned as an object, or null if no entry is found.
 */
async function checkInteraction(userId, type, targetId = null) {
    try {
        if (!userDbConnection) {
            console.error("User database not connected");
            throw new Error("User database not connected");
        }
    
        // Define the query to find the latest log entry for this user and type
        const query = { userId, type };

        // Include targetId in the query only if it's not null
        if (targetId !== null) {
            query.targetId = targetId;
        }

        const options = {
            sort: { createdAt: -1 },  // Sort by creation date in descending order to get the most recent log
            limit: 1,  // Limit the result to only one document
        };

        // Execute the query to fetch the latest log entry
        const logEntry = await userDbConnection.collection('twitterInteractions').findOne(query, options);

        const requiredProperties = ['userId', 'targetId', 'type', 'createdAt'];

        // Check if all properties in logEntry are in activation
        const hasRequiredProperties = logEntry && requiredProperties.every(prop => prop in logEntry);

        if (hasRequiredProperties) {
            // Check if the interaction was successful based on the existence of a response and absence of an error
            if (!!logEntry.response && !logEntry.error) {
                const currentTime = new Date();
                const createdAt = new Date(logEntry.createdAt);
                const timeDifference = currentTime - createdAt;
                const twoHoursInMilliseconds = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

                if (timeDifference < twoHoursInMilliseconds) {
                    return { status: true, targetId: logEntry.targetId, message: `User: ${userId} has already interacted to the target: ${logEntry.targetId} with this action: ${type} within the last two hours.` };
                }

                return { status: false, targetId: logEntry.targetId, message: `User: ${userId} has not interacted to the target: ${logEntry.targetId} with this action: ${type} within the last two hours.` };
            }

            throw new Error("Interaction failed:", logEntry.error);
        } else {
            return { status: false, targetId: null, message: `No interaction found for this user and action: ${type}` };
        }
    } catch (error) {
        console.error("Error checking interaction:", error);
        return { status: false, targetId: null, message: "Error checking interaction" };
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
 * @throws {Error} If there is an error while checking if the user has claimed the airdrop.
 * @note This function checks if a user has already claimed the airdrop by querying the 'airdropClaim' collection in the user database.
 * If the user database is not connected, an error will be thrown.
 * The function executes a query to find a matching entry in the 'airdropClaim' collection based on the provided 'userId' and 'userAddress'.
 * If a matching entry is found, the function returns an object with 'hasClaimed' set to true.
 * If no matching entry is found, the function returns an object with 'hasClaimed' set to false.
 * If there is an error during the process, the error will be logged and rethrown to be handled in the calling function.
 */
async function checkIfClaimedAirdrop(userId, userAddress) {
    try {
        if (!userDbConnection) {
            console.error("User database not connected");
            throw new Error("User database not connected");
        }
    
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
        }

        console.log("User has not claimed the airdrop yet.");
        return { hasClaimed: false };
    } catch (error) {
        console.error("Error checking if claimed airdrop:", error);
        error.code = 10021;
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
 * @throws {Error} If there is an error while logging the airdrop claim.
 * @note This function logs a user's airdrop claim to the user database. If the user database is not connected, an error will be thrown.
 * The function checks if any address has been logged for the provided userId. If no address has been logged, the userAddress is added to the log entry.
 * The log entry is then inserted into the 'airdropClaim' collection in the user database.
 * If an address along with the userId both has already been logged, the log entry is updated with the new userAddress.
 * The function returns an object indicating whether the claim was successfully logged, with 'isLogged' set to true if the claim was logged,
 * or false if the claim was not logged due to a previous log entry for the userId.
 */
async function logUserAirdrop(userId, userAddress) {
    try {
        if (!userDbConnection) {
            console.error("User database not connected");
            throw new Error("User database not connected");
        }

        // Prepare the log entry data
        const logEntry = {
            userId,
            userAddress,
            createdAt: new Date(),
        };

        // Check if any address has been logged for this userId, and update the log entry if found
        // If not found, insert a new log entry
        await userDbConnection.collection('airdropClaim').findOneAndUpdate(
            { userId, userAddress },
            { $set: logEntry },
            { upsert: true, returnOriginal: false },
        );

        console.log(`Airdrop logged for userId: ${userId} with address: ${userAddress}`);    
        return { isLogged: true };
    } catch (error) {
        console.error("Error logging airdrop claim:", error);
        error.code = 10022;
        throw error;  // Rethrow the error to handle it in the calling function
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
async function makeAuthenticatedRequest(accessToken, accessTokenSecret, method, url, body = null) {
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
 * @throws {Error} - If there is an error while fetching or parsing the data.
 * @note This function requires the 'OAuth' library and the 'TWITTER_CONSUMER_KEY' and 'TWITTER_CONSUMER_SECRET' environment variables to be set.
 */
async function getUserTwitterId(accessToken, accessTokenSecret) {
    const url = 'https://api.twitter.com/1.1/account/verify_credentials.json';

    try {
        // Using the modified makeAuthenticatedRequest to handle the GET request
        const parsedData = await makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url);
        
        if (!parsedData.id_str) {
            throw new Error("User ID not found in response data.");
        }
        
        return parsedData.id_str;  // Returns the string version of the user's ID
    } catch (error) {
        console.error("Error fetching or parsing data:", error);
        error.code = 10007;
        throw error;  // Rethrow to maintain error chain
    }
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
 * @throws {Error} If there is an error while retweeting the tweet.
 * @note This function makes an authenticated request to the Twitter API to retweet a specific tweet.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/tweets/retweets/api-reference/post-users-id-retweets
 * Limitation: 5 requests / 15 mins per user, no tweet cap
 */
async function retweetTweet(accessToken, accessTokenSecret, userId, tweetId) {
    const url = `https://api.twitter.com/2/users/${userId}/retweets`;
    const body = JSON.stringify({ tweet_id: tweetId });

    try {
        const result = await checkInteraction(userId, 'retweet', tweetId);
        console.log("Info:", result.message);
        if (result.status) {
            return { statusCode: 200, message: result.message };
        }
        const response = await makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body);
        if (response.errors) {
            const errorDetails = response.errors[0];
            console.error(`Failed to retweet tweet, Error: ${errorDetails.detail}`);
            throw new Error(`Failed to retweet tweet, Error: ${errorDetails.detail}`);
        }
        await logUserInteraction(userId, tweetId, 'retweet', url, body, response);
        await logTwitterInteraction(userId, 'retweet', url, body, response);
        return response;
    } catch (error) {
        await logTwitterInteraction(userId, 'retweet', url, body, null, error);
        console.error('Failed to retweet tweet:', error);
        error.code = 10013;
        throw error;
    }
}

/**
 * @brief Tweets a message on behalf of a user.
 *
 * @param {string} accessToken - The access token for the user.
 * @param {string} accessTokenSecret - The access token secret for the user.
 * @param {string} userId - The ID of the user.
 * @param {string} message - The message to be tweeted.
 * @returns {Promise<object>} - A promise that resolves to the response from the Twitter API.
 * @throws {Error} - If there is an error while tweeting the message.
 * 
 * @note This function makes an authenticated request to the Twitter API to post a specific tweet.
 * Reference: https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
 * Limitation: 5 requests / 15 mins per user, no tweet cap
 */
async function tweetMessage(accessToken, accessTokenSecret, userId, message) {
    const url = `https://api.twitter.com/2/users/${userId}/tweets`;
    const body = JSON.stringify({ text: message });

    try {
        const result = await checkInteraction(userId, 'tweet');
        console.log("Info:", result.message);
        if (result.status) {
            return { statusCode: 200, message: result.message };
        }
        const response = await makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body);
        if (response.errors) {
            const errorDetails = response.errors[0];
            console.error(`Failed to tweet message, Error: ${errorDetails.detail}`);
            throw new Error(`Failed to tweet message, Error: ${errorDetails.detail}`);
        }
        const tweetId = response.data.id;
        await logUserInteraction(userId, tweetId, 'tweet', url, body, response);
        await logTwitterInteraction(userId, 'tweet', url, body, response);
        return response;
    } catch (error) {
        await logTwitterInteraction(userId, 'tweet', url, body, null, error);
        console.error('Failed to tweet message:', error);
        error.code = 10039;
        throw error;
    }
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
 * @throws {Error} If there is an error while liking the tweet.
 * @note This function makes an authenticated request to the Twitter API to like a tweet.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/tweets/likes/api-reference/post-users-id-likes
 * Limitation: 200 requests / 24 hours per user or 5 requests / 15 mins, no tweet cap
 */
async function likeTweet(accessToken, accessTokenSecret, userId, tweetId) {
    const url = `https://api.twitter.com/2/users/${userId}/likes`;
    const body = JSON.stringify({ tweet_id: tweetId });

    try {
        // First, check if the user has already liked the tweet
        const result = await checkInteraction(userId, 'like', tweetId);
        console.log("Info:", result.message);
        if (result.status) {
            // Return an object wrapped in a Promise to keep consistent promise-based flow
            return Promise.resolve({ statusCode: 200, message: result.message });
        }
        // Proceed to make the like request if the tweet has not been liked by the user
        const response = await makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body);
        if (response.errors) {
            const errorDetails = response.errors[0];
            console.error(`Failed to like tweet, Error: ${errorDetails.detail}`);
            // Throw an error to be caught by the outer catch
            throw new Error(`Failed to like tweet, Error: ${errorDetails.detail}`);
        }
        // Log the successful API request
        await logUserInteraction(userId, tweetId, 'like', url, body, response);
        await logTwitterInteraction(userId, 'like', url, body, response);
        return response;  // Return the successful response object
    } catch (error) {
        // Handle both errors from checkInteraction and makeAuthenticatedRequest
        await logTwitterInteraction(userId, 'like', url, body, null, error);
        console.error('Failed to like tweet:', error);
        error.code = 10014;
        // Rethrow the error to ensure it can be handled by the caller
        throw error;
    }
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
 * @throws {Error} If there is an error while bookmarking the tweet.
 * @note This function makes an authenticated request to the Twitter API to bookmark a tweet.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/tweets/bookmarks/api-reference/get-users-id-bookmarks
 * Limitation: 5 requests / 15 mins per user, no tweet cap
 */
async function bookmarkTweet(accessToken, accessTokenSecret, userId, tweetId) {
    const url = `https://api.twitter.com/2/users/${userId}/bookmarks`;
    const body = JSON.stringify({ tweet_id: tweetId });

    try {
        // First, check if the user has already bookmarked the tweet
        const result = await checkInteraction(userId, 'bookmark', tweetId);
        console.log("Info:", result.message);
        if (result.status) {
            // Return an object wrapped in a Promise to keep consistent promise-based flow
            return Promise.resolve({ statusCode: 200, message: result.message });
        }
        // Proceed to make the bookmark request if the tweet has not been bookmarked by the user
        const response = await makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body);
        if (response.errors) {
            const errorDetails = response.errors[0];
            console.error(`Failed to bookmark tweet, Error: ${errorDetails.detail}`);
            // Throw an error to be caught by the outer catch
            throw new Error(`Failed to bookmark tweet, Error: ${errorDetails.detail}`);
        }
        // Log the successful API request
        await logUserInteraction(userId, tweetId, 'bookmark', url, body, response);
        await logTwitterInteraction(userId, 'bookmark', url, body, response);
        return response;  // Return the successful response object
    } catch (error) {
        // Handle both errors from checkInteraction and makeAuthenticatedRequest
        await logTwitterInteraction(userId, 'bookmark', url, body, null, error);
        console.error('Failed to bookmark tweet:', error);
        error.code = 10016;
        // Rethrow the error to ensure it can be handled by the caller
        throw error;
    }
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
async function fetchUserId(username, accessToken, accessTokenSecret) {
    console.log("Fetching user ID for: ", username);
    const url = `https://api.twitter.com/2/users/by/username/${username}`;
    try {
        const response = await makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url);
        if (response.errors) {
            // If Twitter API returns errors, handle them here
            const errorDetails = response.errors[0];
            console.error(`Failed to fetch user ID, Error: ${errorDetails.detail}`);
            throw new Error(`Failed to fetch user ID, Error: ${errorDetails.detail}`);
        } else {
            if (!response.data.id) {
                console.error("User ID not found in response data.");
                throw new Error("User ID not found in response data.");
            }
            // Log the successful API request
            await logTwitterInteraction(response.data.id, 'fetchUserId', url, null, response);
        }
        console.log("Fetched user ID: ", response.data.id);
        return response.data.id;
    } catch (error) {
        // Log the failed API request
        await logTwitterInteraction(null, 'fetchUserId', url, null, null, error);
        error.code = 10009;
        console.error('Failed to fetch user ID: ', error);
        throw new Error('Failed to fetch user ID');
    }
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
 * @throws {Error} If there is an error while following the user.
 * @note This function first obtains the current user's Twitter ID and then makes an authenticated
 * request to follow the specified user using the obtained ID.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/users/follows/api-reference/get-users-id-following
 * Limitation: 5 requests / 15 mins per user, no user cap
 */
async function followUser(accessToken, accessTokenSecret, userId, targetUserId) {
    const url = `https://api.twitter.com/2/users/${userId}/following`;
    const body = JSON.stringify({ target_user_id: targetUserId });

    try {
        // First, check if the user has already followed the target user
        const result = await checkInteraction(userId, 'follow', targetUserId);
        console.log("Info:", result.message);
        if (result.status) {
            // Return an object wrapped in a Promise to keep consistent promise-based flow
            return Promise.resolve({ statusCode: 200, message: result.message });
        }
        // Proceed to make the follow request if the user has not followed the target user yet
        const response = await makeAuthenticatedRequest(accessToken, accessTokenSecret, 'POST', url, body);
        if (response.errors) {
            const errorDetails = response.errors[0];
            console.error(`Failed to follow user, Error: ${errorDetails.detail}`);
            // Throw an error to be caught by the outer catch
            throw new Error(`Failed to follow user, Error: ${errorDetails.detail}`);
        }
        // Log the successful API request
        await logUserInteraction(userId, targetUserId, 'follow', url, body, response);
        await logTwitterInteraction(userId, 'follow', url, body, response);
        return response;  // Return the successful response JSON
    } catch (error) {
        // Handle both errors from checkInteraction and makeAuthenticatedRequest
        await logTwitterInteraction(userId, 'follow', url, body, null, error);
        console.error('Failed to follow user:', error);
        error.code = 10015;
        // Rethrow the error to ensure it can be handled by the caller
        throw error;
    }
}

/**
 * @brief Checks if a tweet has been retweeted by the user.
 * 
 * @param {string} accessToken - The access token for authenticating the request.
 * @param {string} accessTokenSecret - The access token secret for authenticating the request.
 * @param {string} userId - The ID of the user to check for retweets.
 * @param {string} targetTweetId - The ID of the tweet to check if retweeted.
 * 
 * @return {Promise<{isRetweeted: boolean}>} - A promise that resolves to an object containing the retweeted status.
 * @throws {Error} - If there is an error while checking if the tweet is retweeted.
 * @note This function makes an authenticated request to the Twitter API to fetch the user's timeline tweets
 * and checks if any tweet is a retweet of the specified tweetId.
 * If an error occurs during the process, it will be logged and rethrown to be handled by the caller.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/tweets/retweets/api-reference/get-tweets-id-retweeted_by
 * Limitation: 15 requests / 15 mins per user or 15 requests / 15 mins per app, no tweet cap
 */
async function checkIfRetweeted(accessToken, accessTokenSecret, userId, targetTweetId) {
    const url = `https://api.twitter.com/2/tweets/${targetTweetId}/retweeted_by`;
    try {
        // First, check if there is a logged interaction indicating that the user has already retweeted the target tweet
        const result = await checkInteraction(userId, 'retweet', targetTweetId);
        console.log("Info:", result.message);
        if (result.status) {
            // Return an object wrapped in a Promise to keep consistent promise-based flow
            return { isRetweeted: true };
        }
        // If not already retweeted according to logs, check Twitter API to ensure and log new interactions
        const response = await makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url);
        if (!response.errors) {
            // Log the successful API request
            await logTwitterInteraction(userId, 'checkRetweet', url, null, response);
            if (response.data && response.data.length > 0) {
                if (!Array.isArray(response.data) || !response.data.every(item => 'id' in item)) {
                    console.error("User ID not found in response data.");
                    return { isRetweeted: false };
                }
                // Check through the list of tweets to see if targetTweetId is one of them
                const isRetweeted = response.data.some(tweet => tweet.id === userId);
                if (isRetweeted) {
                    // Log only if the tweet is retweeted
                    await logUserInteraction(userId, targetTweetId, 'retweet', url, null, response);
                }
                return { isRetweeted };
            }
            // If the data array is empty, then no tweets were found
            return { isRetweeted: false };
        }

        const errorDetails = response.errors[0];
        console.error(`Failed to check if retweeted, Error: ${errorDetails.detail}`);
        // Throw an error to be caught by the outer catch
        throw new Error(`Failed to check if retweeted, Error: ${errorDetails.detail}`);
    } catch (error) {
        // Log the failed API request or interaction check
        await logTwitterInteraction(userId, 'checkRetweet', url, null, null, error);
        console.error('Error checking if retweeted:', error);
        error.code = 10008;
        throw error;  // Rethrow error to be handled by the caller
    }
}

/**
 * Checks if a user has tweeted a specific tweet.
 *
 * @param {string} accessToken - The access token for making authenticated requests to the Twitter API.
 * @param {string} accessTokenSecret - The access token secret for making authenticated requests to the Twitter API.
 * @param {string} userId - The ID of the user to check.
 * @returns {Promise<{ isTweeted: boolean }>} - A promise that resolves to an object indicating whether the user has tweeted the target tweet.
 * @throws {Error} - If there is an error while checking if the user has tweeted.
 * 
 * @note This function makes an authenticated request to the Twitter API to check if the user has tweeted the target tweet.
 * Reference: https://developer.x.com/en/docs/twitter-api/tweets/lookup/api-reference/get-tweets
 * Limitation: 900 requests / 15 mins per user, no tweet cap
 */
async function checkIfTweeted(accessToken, accessTokenSecret, userId) {
    const url = `https://api.twitter.com/2/users/${userId}/tweets`;
    try {
        // First, check if there is a logged interaction indicating that the user has already tweeted the target tweet
        const result = await checkInteraction(userId, 'tweet');
        console.log("Info:", result.message);
        if (result.status) {
            // Return an object wrapped in a Promise to keep consistent promise-based flow
            return { isTweeted: true };
        }
        // If the user has not tweeted according to logs, return false
        const targetTweetId = result.targetId;
        if (targetTweetId === null) {
            return { isTweeted: false };
        }
        // Check Twitter API to ensure and log new interactions
        const response = await makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url);
        if (!response.errors) {
            // Log the successful API request
            await logTwitterInteraction(userId, 'checkTweet', url, null, response);
            if (response.data && response.data.length > 0) {
                if (!Array.isArray(response.data) || !response.data.every(item => 'id' in item)) {
                    console.error("User ID not found in response data.");
                    return { isTweeted: false };
                }
                // Check through the list of tweets to see if targetTweetId is one of them
                const isTweeted = response.data.some(tweet => tweet.id === targetTweetId);
                if (isTweeted) {
                    // Log only if the tweet is tweeted
                    await logUserInteraction(userId, targetTweetId, 'tweet', url, null, response);
                }
                return { isTweeted };
            }
            // If the data array is empty, then no tweets were found
            return { isTweeted: false };
        }

        const errorDetails = response.errors[0];
        console.error(`Failed to check if tweeted, Error: ${errorDetails.detail}`);
        // Throw an error to be caught by the outer catch
        throw new Error(`Failed to check if tweeted, Error: ${errorDetails.detail}`);
    } catch (error) {
        // Log the failed API request or interaction check
        await logTwitterInteraction(userId, 'checkTweet', url, null, null, error);
        console.error('Error checking if tweeted:', error);
        error.code = 10038;
        throw error;  // Rethrow error to be handled by the caller
    }
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
 * @throws {Error} If there is an error while checking if the user is following another user.
 * @note This function makes an authenticated request to the Twitter API to check the relationship between the authenticated user and the target user.
 * If the authenticated user is following the target user, the promise resolves to { isFollowing: true }, otherwise it resolves to { isFollowing: false }.
 * If there is an error during the request, the promise is rejected with the error.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/users/follows/api-reference/get-users-id-following
 */
async function checkIfFollowed(accessToken, accessTokenSecret, userId, targetUserId) {
    const url = `https://api.twitter.com/2/users/${userId}/following`;
    try {
        // First, check if there is a logged interaction indicating that the user is following the target user
        const result = await checkInteraction(userId, 'follow', targetUserId);
        console.log("Info:", result.message);
        if (result.status) {
            // Return an object wrapped in a Promise to keep consistent promise-based flow
            return { isFollowing: true };
        }
        // If not already following according to logs, fetch current following list from Twitter API
        const response = await makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url);
        if (!response.errors) {
            // Log the successful API request
            await logTwitterInteraction(userId, 'checkFollow', url, null, response);
            if (response.data && response.data.length > 0) {
                if (!Array.isArray(response.data) || !response.data.every(item => 'id' in item)) {
                    console.error("User ID not found in response data.");
                    return { isFollowing: false };
                }
                // Check through the list of followed users to see if targetUserId is one of them
                const isFollowing = response.data.some(user => user.id === targetUserId);
                if (isFollowing) {
                    await logUserInteraction(userId, targetUserId, 'follow', url, null, response);
                }
                return { isFollowing };
            }

            // If the data array is empty, then the user is not following anyone or the specified userId is invalid
            return { isFollowing: false };
        }

        const errorDetails = response.errors[0];
        console.error(`Failed to check if following, Error: ${errorDetails.detail}`);
        // Throw an error to be caught by the outer catch
        throw new Error(`Failed to check if following, Error: ${errorDetails.detail}`);
    } catch (error) {
        // Log the failed API request or interaction check
        await logTwitterInteraction(userId, 'checkFollow', url, null, null, error);
        console.error('Error checking if followed:', error);
        error.code = 10010;
        throw error;  // Rethrow error to be handled by the caller
    }
}

/**
 * @brief Checks if a user has liked a specific tweet.
 * 
 * @param {string} accessToken - The access token for authenticating the request.
 * @param {string} accessTokenSecret - The access token secret for authenticating the request.
 * @param {string} userId - The ID of the user to check if liked the tweet.
 * @param {string} targetTweetId - The ID of the tweet to check if liked.
 * 
 * @return {Promise<{ isLiked: boolean }>} - A promise that resolves to an object containing the result of the check.
 * @throws {Error} - If there is an error while checking if the tweet is liked.
 * @note This function makes an authenticated request to the Twitter API to fetch the user's liked tweets and checks if any of them match the specified tweetId.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/tweets/likes/api-reference/get-users-id-liked_tweets
 */
async function checkIfLiked(accessToken, accessTokenSecret, userId, targetTweetId) {
    const url = `https://api.twitter.com/2/users/${userId}/liked_tweets`;
    try {
        // First, check if there is a logged interaction indicating that the user has already liked the target tweet
        const result = await checkInteraction(userId, 'like', targetTweetId);
        console.log("Info:", result.message);
        if (result.status) {
            // Return an object wrapped in a Promise to keep consistent promise-based flow
            return { isLiked: true };
        }
        // If not already liked according to logs, fetch the current liked tweets from Twitter API
        const response = await makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url);
        if (!response.errors) {
            // Log the successful API request
            await logTwitterInteraction(userId, 'checkLike', url, null, response);
            if (response.data && response.data.length > 0) {
                if (!Array.isArray(response.data) || !response.data.every(item => 'id' in item)) {
                    console.error("User ID not found in response data.");
                    return { isLiked: false };
                }
                // Check through the list of liked tweets to see if targetTweetId is one of them
                const isLiked = response.data.some(tweet => tweet.id === targetTweetId);
                if (isLiked) {
                    await logUserInteraction(userId, targetTweetId, 'like', url, null, response);
                }
                return { isLiked };
            }
            // If the data array is empty, then no tweets were found
            return { isLiked: false };
        }

        const errorDetails = response.errors[0];
        console.error(`Failed to check if liked, Error: ${errorDetails.detail}`);
        // Throw an error to be caught by the outer catch
        throw new Error(`Failed to check if liked, Error: ${errorDetails.detail}`);
    } catch (error) {
        // Log the failed API request or interaction check
        await logTwitterInteraction(userId, 'checkLike', url, null, null, error);
        console.error('Error checking if liked:', error);
        error.code = 10011;
        throw error;  // Rethrow error to be handled by the caller
    }
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
 * @throws {Error} If there is an error while checking if the tweet is bookmarked.
 * @note This function makes an authenticated request to the Twitter API to fetch the user's bookmarks and checks if the specified tweet ID is present in the list.
 * Reference: https://developer.twitter.com/en/docs/twitter-api/tweets/bookmarks/api-reference/get-users-id-bookmarks
 * Limitation: 10 requests / 15 mins per user, no tweet cap
*/
async function checkIfBookmarked(accessToken, accessTokenSecret, userId, targetTweetId) {
    const url = `https://api.twitter.com/2/users/${userId}/bookmarks`;
    // First, check if there is a logged interaction indicating that the user has already bookmarked the target tweet
    try {
        const result = await checkInteraction(userId, 'bookmark', targetTweetId);
        console.log("Info:", result.message);
        if (result.status) {
            // Return an object wrapped in a Promise to keep consistent promise-based flow
            return { isBookmarked: true };
        }
        // If not already bookmarked according to logs, fetch the current bookmarks from Twitter API
        const response = await makeAuthenticatedRequest(accessToken, accessTokenSecret, 'GET', url);
        if (!response.errors) {
            // Log the successful API request
            await logTwitterInteraction(userId, 'checkBookmark', url, null, response);
            if (response.data && response.data.length > 0) {
                if (!Array.isArray(response.data) || !response.data.every(item => 'id' in item)) {
                    console.error("User ID not found in response data.");
                    return { isBookmarked: false };
                }
                // Check through the list of bookmarks to see if targetTweetId is one of them
                const isBookmarked = response.data.some(tweet => tweet.id === targetTweetId);
                if (isBookmarked) {
                    await logUserInteraction(userId, targetTweetId, 'bookmark', url, null, response);
                }
                return { isBookmarked };
            }
            // If the data array is empty, then no bookmarks were found
            return { isBookmarked: false };
        }

        const errorDetails = response.errors[0];
        console.error(`Failed to check if bookmarked, Error: ${errorDetails.detail}`);
        // Throw an error to be caught by the outer catch
        throw new Error(`Failed to check if bookmarked, Error: ${errorDetails.detail}`);
    } catch (error) {
        // Log the failed API request or interaction check
        await logTwitterInteraction(userId, 'checkBookmark', url, null, null, error);
        console.error('Error checking if bookmarked:', error);
        error.code = 10012;
        throw error;  // Rethrow error to be handled by the caller
    }
}

/**
 * @brief Checks if a user has completed all required interactions on Twitter.
 * 
 * @param {string} userId - The ID of the user to check.
 * @param {string[]} requiredTypes - An array of interaction types to check for.
 * 
 * @return {Promise<{ isFinished: boolean }>} A promise that resolves to an object containing the result of the check.
 * @throws {Error} If there is an error while checking the user's interactions.
 * @note This function checks if the specified user has completed all the required interaction types on Twitter, including like, retweet, reply, and follow.
 * It uses the checkUserSteps function to determine if the user has completed all interactions.
 * If the user has completed all interactions, the promise resolves to { isFinished: true }, otherwise it resolves to { isFinished: false }.
 * If there is an error during the process, the promise is rejected with the error.
 */
async function checkIfFinished(userId, requiredTypes) {
    try {
        // Check if the user has completed all required check procedures
        const hasAllInteractions = await checkUserSteps(userId, requiredTypes);
        
        if (hasAllInteractions) {
            console.log("User has all required interaction types.");
            return { isFinished: true };
        }

        console.log("User does not have all required interaction types.");
        return { isFinished: false };
    } catch (error) {
        console.error("Failed to check user interactions:", error);
        error.code = 10028;
        throw error;  // Rethrow the error to be handled by the caller
    }
}

/**
 * @brief Generates a random string of the specified length.
 * @param {number} length - The length of the random string to generate.
 * @return {string} The randomly generated string.
 * @note This function uses characters from the set of uppercase letters, lowercase letters, and digits.
 */
function generateRandomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i += 1) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

/**
 * @brief Generates and stores a promotion code for a user.
 * 
 * @param {string} userAddress - The address of the user.
 * 
 * @return {string} The generated promotion code.
 * 
 * @note If a promotion code already exists for the user, the existing code will be returned.
 *       Otherwise, a new code will be generated and stored in the database.
 * 
 * @throws {Error} If there is an error generating or storing the promotion code.
 */
async function generatePromotionCode(userAddress) {
    try {
        if (!userDbConnection) {
            throw new Error('Database connection not established');
        }

        // Check if there is already a promotion code for this user
        let logEntry = await userDbConnection.collection('promotionCode').findOne({ userAddress });

        // Check if required properties are in the logEntry
        if (logEntry && logEntry.promotionCode) {
            return logEntry.promotionCode; // Return the existing code if found
        }

        // Generate a new code if not found
        const promotionCode = generateRandomString(16); // Function to generate a random string

        // If the log entry is missing some properties, update or insert it
        logEntry = await userDbConnection.collection('promotionCode').findOneAndUpdate(
            { userAddress },
            { $set: { userAddress, promotionCode, createdAt: new Date() } },
            { upsert: true, returnOriginal: false, returnDocument: 'after' },
        ).value;

        return logEntry.value.promotionCode; // Return the new promotion code after successful insertion
    } catch (error) {
        console.error('Failed to generate and store promotion code:', error);
        error.code = 10029;
        throw error; // Re-throw the error to be handled by the caller
    }
}

/**
 * @brief Uses a promotion code to update the user record with the parent address.
 * 
 * @param {string} userAddress - The address of the user.
 * @param {string} promotionCode - The promotion code to be used.
 * 
 * @return {object} An object indicating whether the promotion code was valid.
 * @throws {Error} If there is an error using the promotion code.
 * @note This function fetches the promotion document using the provided promotion code from the 'promotionCode' collection in the database.
 * If a document is found, the user record is updated with the parent address based on the address found in the promotion document.
 * If no document is found with the provided promotion code, an error is thrown.
 * Any errors that occur during database operations are caught and logged, and then re-thrown for the caller to handle.
 */
async function usePromotionCode(userAddress, promotionCode) {
    // We need to check if user has already been eligible for the promotion code
    try {
        if (!userDbConnection) {
            throw new Error('Database connection not established');
        }

        // Fetch the promotion document using the promotion code
        const promoDoc = await userDbConnection.collection('promotionCode').findOne({ promotionCode }, { sort: { createdAt: -1 } });

        if (promoDoc && promoDoc.userAddress) {
            // Proceed with updating the user record if the promotion code is found
            await userDbConnection.collection('users').updateOne(
                { userAddress }, // Filter condition to find the user record
                { $set: { parentAddress: promoDoc.userAddress } }, // Setting parentAddress based on the address found in the promoDoc
            );
            return { valid: true };
        }
        // Throw an error if no document is found with the provided promotion code
        console.error('Invalid promotion code');
        return { valid: false };
    } catch (error) {
        // Catch and handle any errors that occur during database operations
        console.error('Error using promotion code:', error);
        error.code = 10025;
        throw error; // Re-throw the error to be handled by the caller
    }
}

/**
 * @brief Checks the eligibility of a user based on their user address.
 * 
 * @param {string} userAddress - The user address to check eligibility for.
 * 
 * @return {object} An object indicating whether the user is eligible.
 * 
 * @note This function makes an API call to check the eligibility of the user address.
 * If the user is not found in the database, it inserts a new user with the user address
 * and eligibility based on the API result.
 * 
 * @throws {Error} - Throws an error if there is an error checking the eligibility.
 */
async function checkIfPurchased(userAddress) {
    try {
        if (!userDbConnection) {
            throw new Error('Database connection not established');
        }

        const user = await userDbConnection.collection('users').findOne({ userAddress });

        if (!user || user.purchase === undefined) {
            // Endpoint: /check_eligibility
            const apiUrl = `${airdropCheckAddress}?address=${encodeURIComponent(userAddress)}`;
            const response = await fetch(apiUrl);
            const data = await response.json();
            const purchaseStatus = data.data;
            console.log('Eligibility checking response:', data);
            if (data.code !== 0 || purchaseStatus === undefined) {
                throw new Error(data.error || 'Error occurred while checking eligibility');
            }

            // Update the user record if it exists, otherwise create a new one
            await userDbConnection.collection('users').updateOne(
                { userAddress },
                { $set: { purchase: purchaseStatus === true } },
                { upsert: true },
            );

            return { purchase: purchaseStatus === true };
        }

        console.log('User purchase status:', user.purchase);
        return { purchase: user.purchase };
    } catch (error) {
        console.error('Error checking buyer:', error);
        error.code = 10027;
        throw error; // Re-throw the error to be handled by the caller
    }
}

/**
 * @brief Find the parent user address based on the child user address.
 * 
 * @param {string} userAddress - The address of the child user.
 * 
 * @return {object} An object containing the parent address.
 * @throws {Error} If there is an error finding the parent user address.
 * @note This function retrieves the parent address of the child user and rewards the parent user with the address.
 * If the parent address is not found or no parent address is available, it returns null.
 * Any errors that occur during the process are logged and optionally re-thrown.
 */
async function findParentUserAddress(userAddress) {
    try {
        if (!userDbConnection) {
            throw new Error('Database connection not established');
        }

        // Retrieve the child user's document to get the parent address
        const doc = await userDbConnection.collection('users').findOne({ userAddress });
        if (!doc) throw new Error('User not found.');

        if (doc.parentAddress) {
            const claim = await userDbConnection.collection('airdropClaim').findOne({ userAddress: doc.parentAddress }, { sort: { createdAt: -1 } });

            if (!claim) throw new Error('No address found for parent user.');

            const parentAddress = claim.userAddress;
            // Logic to reward the parent user with the address can be added here
            console.log(`Rewarding parent at address ${parentAddress}`);
            
            return ({ parentAddress });
        }

        throw new Error('No parent address available for this user.');
    } catch (error) {
        // Log or handle errors appropriately within the catch block
        console.error('Error in rewarding parent user:', error);
        error.code = 10033;
        throw error;  // Optionally re-throw the error to be handled by the caller
    }
}

/**
 * @brief Checks the reward for a parent user based on their purchase status.
 * 
 * @param {string} userAddress - The address of the user.
 * @param {string} airdropAmount - The amount of the reward to be appended.
 * @param {object} airdropRewardMaxForBuyer - The maximum reward amount for a buyer.
 * @param {object} airdropRewardMaxForNotBuyer - The maximum reward amount for a non-buyer.
 * 
 * @return {object} - The append amount, reward status and max reward amount.
 * @throws {Error} - If there is an error checking the reward for the parent user.
 * @note This function assumes that there is a MongoDB connection named `userDbConnection` and a collection named `users`.
 */
async function checkRewardParentUser(userAddress, airdropAmount, { airdropRewardMaxForBuyer, airdropRewardMaxForNotBuyer }) {
    try {
        if (!userDbConnection) {
            throw new Error('Database connection not established');
        }

        const doc = await userDbConnection.collection('users').findOne({ userAddress });
        if (!doc) throw new Error('User not found.');

        const maxReward = doc.purchase ? parseInt(airdropRewardMaxForBuyer, 10) : parseInt(airdropRewardMaxForNotBuyer, 10);

        const docParent = await userDbConnection.collection('promotionCode').findOne({ userAddress });
        if (!docParent) throw new Error('No parent user address found.');

        let appendAmount = 0;
        if (docParent.totalRewardAmount) {
            if (docParent.totalRewardAmount < maxReward) {
                appendAmount = Math.min(maxReward - docParent.totalRewardAmount, parseInt(airdropAmount, 10));
            }
        } else {
            appendAmount = Math.min(maxReward, parseInt(airdropAmount, 10));
        }

        return ({ appendAmount, reward: appendAmount > 0, maxReward });
    } catch (error) {
        console.error('Failed to check reward for parent user:', error);
        error.code = 10034;
        throw error; // Re-throw the error to be handled by the caller
    }
}

/**
 * @brief Appends the reward amount to the total reward amount of a parent user.
 * 
 * @param {string} userAddress - The address of the parent user.
 * @param {string} rewardAmount - The amount of the reward in total.
 * 
 * @return {Object|null} - The updated total reward amount of the parent user, or null if no promotion code is found.
 * @throws {Error} - If there is an error appending the reward for the parent user.
 * @note This function checks if there is already a promotion code for the user. If a promotion code is found, it appends the reward amount to the existing total reward amount. If the reward amount exceeds the maximum reward amount, it returns the existing total reward amount without appending. If no promotion code is found, it returns null.
 */
async function appendRewardParentUser(userAddress, rewardAmount) {
    try {
        if (!userDbConnection) {
            throw new Error('Database connection not established');
        }

        // Check if there is already a promotion code for this user
        const doc = await userDbConnection.collection('promotionCode').findOne({ userAddress });
        if (!doc) {
            throw new Error('No total reward amount found for this parent user.');
        }

        // Append the reward amount to the existing total reward amount
        await userDbConnection.collection('promotionCode').updateOne(
            { userAddress },
            { $set: { totalRewardAmount: rewardAmount } },
        );

        return ({ totalRewardAmount: rewardAmount });
    } catch (error) {
        console.error('Failed to append reward for parent user:', error);
        error.code = 10035;
        throw error; // Re-throw the error to be handled by the caller
    }
}

/**
 * @brief Checks the total reward amount for a given user address.
 * 
 * @param {string} userAddress - The address of the user.
 * 
 * @return {object} - An object containing the total reward amount for the user.
 * @throws {Error} - If there is an error checking the reward amount for the user.
 * @note This function requires a valid database connection to be established before calling.
 */
async function checkRewardAmount(userAddress) {
    try {
        if (!userDbConnection) {
            throw new Error('Database connection not established');
        }

        const doc = await userDbConnection.collection('promotionCode').findOne({ userAddress });
        if (!doc || !doc.totalRewardAmount) {
            console.log('No total reward amount found for this parent user.');
            return ({ totalRewardAmount: 0 });
        }

        return ({ totalRewardAmount: doc.totalRewardAmount });
    } catch (error) {
        console.error('Failed to check reward amount for user:', error);
        error.code = 10037;
        throw error; // Re-throw the error to be handled by the caller
    }
}

/**
 * @brief Logs the subscription information for a user.
 * 
 * @param {string} userEmail - The email of the user.
 * @param {string|null} userName - The name of the user (optional).
 * @param {object|null} subscriptionInfo - The subscription information (optional).
 * 
 * @return {object} - An object indicating whether the subscription info was logged and updated.
 *                   - isLogged: true if the subscription info was logged, false otherwise.
 *                   - isUpdated: true if the subscription info was updated, false otherwise.
 * @throws {Error} - If there is an error logging the subscription information.
 * @note If the user already exists in the database, the function updates the existing subscription info.
 *       If the user does not exist, the function inserts a new document with the subscription info.
 *       The function throws an error if the user database is not connected or if there is an error logging the subscription info.
 */
async function logSubscriptionInfo(userEmail, userName = null, subscriptionInfo = null) {
    try {
        if (!userDbConnection) {
            throw new Error('Database connection not established');
        }

        const options = {
            sort: { createdAt: -1 },  // Sort by creation date in descending order to get the most recent log
            limit: 1,  // Limit the result to only one document
        };

        // Log the subscription information for the user
        const existingUser = await userDbConnection.collection('subscriptionInfo').findOne({ userEmail, userName, subscriptionInfo }, options);
        if (existingUser) {
            const updateFields = {
                createdAt: new Date(),
            };

            // Update the existing subscription info if it is different
            await userDbConnection.collection('subscriptionInfo').updateOne(
                { userEmail, userName, subscriptionInfo },
                {
                    $set: updateFields,
                },
            );
            console.log(`Subscription info logged for user at email: ${userEmail}`);
            return { isLogged: true, isUpdated: true };
        }

        await userDbConnection.collection('subscriptionInfo').insertOne({
            userEmail,
            userName,
            subscriptionInfo,
            createdAt: new Date(),
        });
        console.log(`Subscription info re-logged for user at email: ${userEmail}`);
        return { isLogged: true, isUpdated: false };
    } catch (error) {
        console.error('Error logging subscription info:', error);
        error.code = 10041;
        throw error; // Re-throw the error to be handled by the caller
    }
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
    checkIfFinished,
    generatePromotionCode,
    usePromotionCode,
    findParentUserAddress,
    logSubscriptionInfo,
    checkIfPurchased,
    appendRewardParentUser,
    checkRewardParentUser,
    checkRewardAmount,
    checkIfTweeted,
    tweetMessage,
};
