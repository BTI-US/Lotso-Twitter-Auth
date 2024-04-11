# Twitter OAuth Docker Project

## Overview
This project implements a serverless function to authenticate Twitter users via OAuth and check their tweets for specific content. It uses Docker to containerize the application, ensuring a consistent environment for development, testing, and deployment.

## Features
- OAuth authentication with Twitter.
- Fetching tweets from authenticated user's timeline.
- Checking if any tweet contains specified content.

## Requirements
- [Node.js](https://nodejs.org/)
- [Docker](https://www.docker.com/)
- Twitter Developer Account and API keys.

## Installation and Setup
### Setting Up Twitter API Keys
1. Create a Twitter Developer account and an application to obtain your API keys.
2. Set your `TWITTER_CONSUMER_KEY` and `TWITTER_CONSUMER_SECRET` as environment variables or securely store them for use in the application.

### Building the Docker Image
1. Clone the repository:
   ```bash
   git clone https://github.com/BTI-US/Lotso-Twitter-Auth
   cd Lotso-Twitter-Auth
   ```
2. Build the Docker image:
   ```bash
   docker build -t twitter-auth .
   ```

## Running the Application
Run the Docker container with the necessary environment variables:
```bash
docker run -e TWITTER_CONSUMER_KEY='your_key' -e TWITTER_CONSUMER_SECRET='your_secret' -p 5000:5000 twitter-auth
```

## Usage
The application has three main endpoints:
- `/start-auth`: Initiates the OAuth process.
- `/callback`: Handles the callback from Twitter and exchanges the request token for an access token.
- `/check-tweets`: Checks the authenticated user's tweets for specific content.

## Testing
Describe how to run tests for this application, if applicable.

## Contributing
Contributions to this project are welcome. Please ensure you follow the guidelines outlined in CONTRIBUTING.md.

## License
Specify the license under which this project is made available.
