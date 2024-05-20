const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const redis = require('redis');
const RedisStore = require('connect-redis').default;
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const cors = require('cors');

const app = express();
app.set('trust proxy', 1); // Trust the first proxy

// Function to generate a secret key
function generateSecretKey(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

const redisClient = redis.createClient({
    socket: {
        host: process.env.REDIS_HOST || 'redis',
        port: process.env.REDIS_PORT || '6379',
    },
});
redisClient.connect();
const sessionStore = new RedisStore({ client: redisClient });

redisClient.on('error', (err) => {
    console.log('Could not establish a connection with Redis. ', err);
});

redisClient.on('connect', (err) => {
    console.log('Connected to Redis successfully');
});

redisClient.on('end', () => {
    console.log('Redis client has disconnected from the server.');
});

redisClient.on('reconnecting', () => {
    console.log('Redis client is trying to reconnect to the server.');
});

redisClient.on('ready', () => {
    console.log('Redis client is ready to accept requests.');
});

redisClient.on('warning', (warning) => {
    console.log('Redis client received a warning:', warning);
});

redisClient.on('monitor', (time, args, source, database) => {
    console.log('Redis client is monitoring:', time, args, source, database);
});

redisClient.on('message', (channel, message) => {
    console.log('Redis client received a message:', channel, message);
});

if (!process.env.DOCKER_ENV) {
    require('dotenv').config();
}

// Only allow your specific frontend domain and enable credentials
const corsOptions = {
    origin(origin, callback) {
        callback(null, true);
    },
    credentials: true, // Enable credentials
    allowedHeaders: '*', // Accept any headers
    exposedHeaders: '*', // Expose any headers
};

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Documentation for the Twitter OAuth API',
            version: '1.0.0',
            description: 'This API provides endpoints for Twitter OAuth authentication and airdrop recipient information.',
        },
    },
    apis: ['./server.js'],
};

const swaggerUiOptions = {
    customSiteTitle: "Twitter OAuth API Documentation",
};

const swaggerSpecs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, swaggerUiOptions));

app.use(cors(corsOptions));
app.use(session({
    store: sessionStore,
    secret: generateSecretKey(), // Generate a random secret key for the session
    resave: false,
    saveUninitialized: true,
    cookie: {
        path: '/',
        secure: true, // Set secure cookies based on the connection protocol
        httpOnly: true, // Protect against client-side scripting accessing the cookie
        maxAge: 3600000, // Set cookie expiration, etc.
        sameSite: 'None',
    },
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// TEST: Middleware to log session data for debugging
app.use((req, res, next) => {
    console.log("Session middleware check: Session ID is", req.sessionID);
    console.log("Session data:", req.session);
    next();
});

module.exports = {
    app,
    corsOptions,
};
