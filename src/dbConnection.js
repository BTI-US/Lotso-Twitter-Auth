const mongoUtil = require('./db');
const {
    logTwitterInteractionsSchema,
    twitterInteractionsSchema,
    airdropClaimSchema,
    promotionCodeSchema,
    userSchema,
    subscriptionInfoSchema,
    } = require('./dbSchema');

let dbConnection = null;
let userDbConnection = null;

/**
 * @brief Removes duplicate documents from a collection based on specified fields.
 * @param {Collection} collection - The MongoDB collection to remove duplicates from.
 * @param {Object} fields - The fields to consider for identifying duplicates.
 * @return {Promise<void>} - A promise that resolves when the duplicates are removed.
 * @note This function uses the MongoDB aggregation framework to identify and remove duplicates.
 */
async function removeDuplicates(collection, fields) {
    const groupFields = Object.fromEntries(Object.keys(fields).map(key => [key, `$${key}`]));

    const duplicates = await collection.aggregate([
        { $group: { _id: groupFields, count: { $sum: 1 }, dups: { $push: "$_id" } } },
        { $match: { count: { $gt: 1 } } },
    ]).toArray();

    await Promise.all(duplicates.map(async (duplicate) => {
        duplicate.dups.shift();      // First element skipped for deleting
        await collection.deleteMany({ _id: { $in: duplicate.dups } });
    }));
}

/**
 * @brief Creates an index in a MongoDB collection based on the specified fields.
 * If an index with the same fields already exists, it will be dropped and recreated.
 *
 * @param {Collection} collection - The MongoDB collection to create the index in.
 * @param {Object} fields - The fields to create the index on.
 * @param {boolean} [unique=false] - Optional. Specifies whether the index should enforce uniqueness.
 * @return {Promise<void>} - A promise that resolves when the index is created or already exists.
 * @note This function assumes that the MongoDB collection has been properly initialized and connected.
 */
async function createIndex(collection, fields, unique = false) {
    const indexName = Object.keys(fields).join('_');
    const indexes = await collection.listIndexes().toArray();

    const existingIndex = indexes.find(index => JSON.stringify(index.key) === JSON.stringify(fields));

    if (existingIndex) {
        if (existingIndex.name !== indexName) {
            // Drop the existing index if it has a different name
            await collection.dropIndex(existingIndex.name);
        } else {
            // If the existing index has the same name, no need to create it again
            return;
        }
    }

    if (unique) {
        // Handle duplicates before creating a unique index
        await removeDuplicates(collection, fields);
    }

    return collection.createIndex(fields, { unique, name: indexName });
}

/**
 * @brief Ensures that a collection exists in the MongoDB database.
 * 
 * @param {Db} db - The MongoDB database object.
 * @param {string} collectionName - The name of the collection to ensure exists.
 * @param {Object} schema - The schema to validate the collection against.
 * 
 * @return {Promise<void>} - A promise that resolves when the collection is ensured to exist.
 * 
 * @note This function checks if a collection with the specified name exists in the MongoDB database.
 * If the collection does not exist, it creates the collection with the provided schema.
 * The function uses the MongoDB `listCollections` method to check if the collection exists.
 * If the collection does not exist, it uses the `createCollection` method to create the collection with the provided schema.
 * The function returns a promise that resolves when the collection is ensured to exist.
 */
async function ensureCollectionExists(db, collectionName, schema) {
    const collections = await db.listCollections({ name: collectionName }, { nameOnly: true }).toArray();
    if (collections.length === 0) {
        await db.createCollection(collectionName, { validator: schema });
    }
}

mongoUtil.connectToServer()
    .then(async ({ dbConnection: localDbConnection, userDbConnection: localUserDbConnection }) => {
        console.log("Successfully connected to MongoDB.");
        // Create indexes after ensuring the database connection is established

        await Promise.all([
            ensureCollectionExists(localDbConnection, 'twitterInteractions', logTwitterInteractionsSchema),
            ensureCollectionExists(localUserDbConnection, 'twitterInteractions', twitterInteractionsSchema),
            ensureCollectionExists(localUserDbConnection, 'airdropClaim', airdropClaimSchema),
            ensureCollectionExists(localUserDbConnection, 'promotionCode', promotionCodeSchema),
            ensureCollectionExists(localUserDbConnection, 'users', userSchema),
            ensureCollectionExists(localUserDbConnection, 'subscriptionInfo', subscriptionInfoSchema),
        ]);

        Promise.all([
            createIndex(localDbConnection.collection('twitterInteractions'), { userId: 1, targetId: 1, type: 1 }, false),
            // Enforce uniqueness on the userId field but allow multiple type values for each userId.
            createIndex(localUserDbConnection.collection('twitterInteractions'), { userId: 1, targetId: 1, type: 1 }, true),
            createIndex(localUserDbConnection.collection('airdropClaim'), { userAddress: 1 }, true),
            createIndex(localUserDbConnection.collection('promotionCode'), { userAddress: 1 }, true),
            createIndex(localUserDbConnection.collection('users'), { userAddress: 1 }),
            createIndex(localUserDbConnection.collection('subscriptionInfo'), { userEmail: 1 }, true),
        ])
            .catch(err => console.error("Error creating indexes:", err));
        
        dbConnection = localDbConnection;
        userDbConnection = localUserDbConnection;
    })
    .catch(err => {
        console.error("Failed to connect to MongoDB:", err);
        process.exit(1);
    });

module.exports = {
    dbConnection,
    userDbConnection,
};
