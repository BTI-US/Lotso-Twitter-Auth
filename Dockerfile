# Use an official Node runtime as a parent image
FROM node:14

# Define build arguments
ARG TWITTER_CONSUMER_KEY
ARG TWITTER_CONSUMER_SECRET

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install any dependencies
RUN npm install

# Bundle your app's source code inside the Docker image
COPY src/ .

# Make your service available on a specific port
EXPOSE 5000

# Define the command to run your app (adjust "app.js" if your file has a different name)
CMD [ "node", "app.js" ]
