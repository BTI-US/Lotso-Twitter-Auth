const codeToErrorMap = {
    10000: 'Unknown error',
    10001: 'Wrong params',
    10002: 'Authentication failed',
    10003: 'No session found',
    10004: 'Address not found in request param or invalid address',
    10005: 'Tweet id not found in request param or invalid tweet id',
    10006: 'User name not found in request param or invalid user name',
    10007: 'Failed to get current user id',
    10008: 'Failed to get user retweet status',
    10009: 'Failed to get target user id',
    10010: 'Failed to get user follow status',
    10011: 'Failed to get user like status',
    10012: 'Failed to get user bookmark status',
    10013: 'Failed to retweet the tweet',
    10014: 'Failed to like the tweet',
    10015: 'Failed to follow the user',
    10016: 'Failed to bookmark the tweet',
    10017: 'Tweet has been retweeted before',
    10018: 'Tweet has been liked before',
    10019: 'User has been followed before',
    10020: 'Tweet has been bookmarked before',
    10021: 'Failed to check airdrop status',
    10022: 'Failed to log airdrop claim',
    10023: 'Invalid step number',
    10024: 'Promotion code not found',
    10025: 'Invalid promotion code',
    10026: 'Error while processing promotion code',
    10027: 'Error checking buyer',
    10028: 'Failed to check user interactions',
    10029: 'Failed to generate and store promotion code',
    10030: 'Failed to generate promotion code',
    10031: 'User has not completed the required steps',
    10032: 'The total airdrop amount is exceeded the limitation',
    10033: 'Error in rewarding parent user',
    10034: 'Failed to check reward for parent user',
    10035: 'Error appending reward for parent user',
    10036: 'Error checking recipient count',
    10037: 'Error checking user reward amount',
    10040: 'Failed to get user email',
    10041: 'Error logging subscription info',
    10050: 'Failed to get OAuth request token',
};

// Example usage:
// const response = createResponse(
//     0, 
//     "Success", 
//     {
//         address: "0x0000000000000000000000000000000000000001"
//     }
// );
/**
 * @brief Creates a response object with the given code, message, and data.
 *
 * @param {number} code - The code representing the response status.
 * @param {string} message - The message describing the response.
 * @param {Object} [data={}] - The additional data associated with the response.
 * 
 * @return {Object} - The response object containing the code, status, message, error, and data.
 * 
 * @note The codeToErrorMap is used to map non-zero codes to error objects.
 */
function createResponse(code, message, data = {}) {
    const error = code !== 0 ? codeToErrorMap[code] : null;
    const status = code === 0 ? 'success' : 'error';

    return {
        code,
        status,
        message,
        error,
        data,
    };
}

module.exports = {
    createResponse,
};
