# Use an official Node runtime as a parent image
FROM node:20

# Update npm
RUN npm install -g npm@10.5.0

# Define build arguments
ARG DOCKER_ENV="true"
ARG PRIVKEY_PATH
ARG CERT_PATH
ARG SERVER_PORT
ARG MONGODB_USERNAME
ARG MONGODB_PASSWORD
ARG MONGODB_PORT
ARG MONGODB_DB
ARG MONGODB_USERDB
ARG TWITTER_CONSUMER_KEY
ARG TWITTER_CONSUMER_SECRET
ARG MONGODB_HOST="mongodb"
ARG REDIS_HOST="redis"
ARG REDIS_PORT
ARG AIRDROP_SERVER_HOST="airdrop-server"
ARG AIRDROP_SERVER_PORT
ARG AIRDROP_PER_STEP
ARG AIRDROP_REWARD_MAX_FOR_BUYER
ARG AIRDROP_REWARD_MAX_FOR_NOT_BUYER
ARG AIRDROP_PER_PERSON
ARG LOTSO_PURCHASED_USER_AMOUNT
ARG WEBPAGE_ADDRESS
ARG AUTH_WEB_ADDRESS

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install any dependencies
RUN npm install

# Copy local code to the container image.
COPY src/ .

# Run the web service on container startup
CMD [ "node", "start.js" ]
