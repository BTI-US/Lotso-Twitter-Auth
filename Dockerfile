# Use an official Node runtime as a parent image
FROM node:14

# Define build arguments
ARG TWITTER_CONSUMER_KEY
ARG TWITTER_CONSUMER_SECRET
ARG PORT

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install any dependencies
RUN npm install

# Copy local code to the container image.
COPY src/ .

# Run the web service on container startup
CMD [ "node", "server.js" ]
