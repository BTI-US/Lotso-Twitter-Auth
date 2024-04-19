const { MongoClient } = require('mongodb');

if (!process.env.DOCKER_ENV) {
    require('dotenv').config();
}

// Construct the MongoDB URI using environment variables
const uri = `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}`
            + `@${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/?authSource=admin`;

const client = new MongoClient(uri);
let dbConnection = null;
let userDbConnection = null;

module.exports = {
    connectToServer() {
        return new Promise((resolve, reject) => {
            client.connect()
                .then(() => {
                    console.log("Connected successfully to MongoDB server");
                    // Connect to the log database
                    dbConnection = client.db(process.env.MONGODB_DB);
                    // Connect to the user database
                    userDbConnection = client.db(process.env.MONGODB_USERDB);
                    resolve({ dbConnection, userDbConnection });
                })
                .catch((err) => {
                    console.error("Failed to connect to MongoDB server:", err);
                    reject(err);
                });
        });
    },
    getDb() {
        return dbConnection;
    },
    getUserDb() {
        return userDbConnection;
    },
    closeConnection() {
        console.log("Closing connection to MongoDB server");
        client.close();
    },
};
