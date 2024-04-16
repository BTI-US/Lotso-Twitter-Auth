const { MongoClient } = require('mongodb');

if (!process.env.DOCKER_ENV) {
    require('dotenv').config();
}

const client = new MongoClient(process.env.MONGODB_URI);

let dbConnection;

module.exports = {
    connectToServer() {
        return new Promise((resolve, reject) => {
            client.connect()
                .then(() => {
                    console.log("Connected successfully to MongoDB server");
                    dbConnection = client.db('twitterLogs'); // This is how you select the database
                    resolve(dbConnection);
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
    closeConnection() {
        console.log("Closing connection to MongoDB server");
        client.close();
    },
};
