# REST API Endpoints for Lotso-Twitter-Auth

## Authentication

The following endpoints including authentication from the frontend website, callback from the Twitter server and authentication check.

1. **GET /start-auth**
   - **Description:** Retrieves the transaction count for a given address.
   - **Parameters:**
     - None
   - **Response:**
     - ???
   - **Example:**
     ```json
     {
       "code": 10009,
       "message": "Get recipients count failed",
       "error": "execution reverted",
       "data": 0
     }
     ```
2. **GET /twitter-callback**
   - **Description:** Handles the callback from Twitter and exchanges the request token for an access token.
   - **Parameters:**
     - None
   - **Response:**
     - ???
   - **Example:**
     ```json
     {
       "code": 10009,
       "message": "Get recipients count failed",
       "error": "execution reverted",
       "data": 0
     }
     ```
3. **GET /check-auth-status**
   - **Description:** Checks if the user is authenticated.
   - **Parameters:**
     - None
   - **Response:**
     - ???
   - **Example:**
     ```json
     {
       "code": 10009,
       "message": "Get recipients count failed",
       "error": "execution reverted",
       "data": 0
     }
     ```

## Actions