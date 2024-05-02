const logTwitterInteractionSchema = {
    $jsonSchema: {
        bsonType: "object",
        required: ["userId", "type", "url", "createdAt"],
        properties: {
            userId: {
                bsonType: "string",
                description: "must be a string and is required",
            },
            type: {
                bsonType: "string",
                description: "must be a string and is required",
            },
            url: {
                bsonType: "string",
                description: "must be a string and is required",
            },
            requestBody: {
                bsonType: ["object", "null"],
                description: "must be an object or null and is optional",
            },
            createdAt: {
                bsonType: "date",
                description: "must be a date and is required",
            },
            response: {
                bsonType: ["object", 'null'],
                description: "must be an object or null and is optional",
            },
            error: {
                bsonType: "string",
                description: "must be a string and is optional",
            },
        },
    },
};

const twitterInteractionSchema = {
    $jsonSchema: {
        bsonType: "object",
        required: ["userId", "targetId", "type", "url", "createdAt"],
        properties: {
            userId: {
                bsonType: "string",
                description: "must be a string and is required",
            },
            targetId: {
                bsonType: "string",
                description: "must be a string and is required",
            },
            type: {
                bsonType: "string",
                description: "must be a string and is required",
            },
            url: {
                bsonType: "string",
                description: "must be a string and is required",
            },
            requestBody: {
                bsonType: ["object", "null"],
                description: "must be an object or null and is optional",
            },
            createdAt: {
                bsonType: "date",
                description: "must be a date and is required",
            },
            response: {
                bsonType: ["object", 'null'],
                description: "must be an object or null and is optional",
            },
            error: {
                bsonType: "string",
                description: "must be a string and is optional",
            },
        },
    },
};

const airdropClaimSchema = {
    $jsonSchema: {
        bsonType: "object",
        required: ["userId", "userAddress", "createdAt"],
        properties: {
            userId: {
                bsonType: "string",
                description: "must be a string and is required",
            },
            userAddress: {
                bsonType: "string",
                description: "must be a string and is required",
            },
            createdAt: {
                bsonType: "date",
                description: "must be a date and is required",
            },
        },
    },
};

const promotionCodeSchema = {
    $jsonSchema: {
        bsonType: "object",
        required: ["userAddress", "promotionCode", "createdAt"],
        properties: {
            userAddress: {
                bsonType: "string",
                description: "must be a string and is required",
            },
            promotionCode: {
                bsonType: "string",
                description: "must be a string and is required",
            },
            totalRewardAmount: {
                bsonType: "int",
                description: "must be an integer and is optional",
            },
            createdAt: {
                bsonType: "date",
                description: "must be a date and is required",
            },
        },
    },
};

const userSchema = {
    $jsonSchema: {
        bsonType: "object",
        required: ["userAddress", "purchase", "createdAt"],
        properties: {
            userAddress: {
                bsonType: "string",
                description: "must be a string and is required",
            },
            parentAddress: {
                bsonType: "string",
                description: "must be a string and is optional",
            },
            purchase: {
                bsonType: "bool",
                description: "must be a boolean and is required",
            },
            createdAt: {
                bsonType: "date",
                description: "must be a date and is required",
            },
        },
    },
};

const subscriptionInfoSchema = {
    $jsonSchema: {
        bsonType: "object",
        required: ["userEmail", "createdAt"],
        properties: {
            userEmail: {
                bsonType: "string",
                description: "must be a string and is required",
            },
            userName: {
                bsonType: "string",
                description: "must be a string and is optional",
            },
            subscriptionInfo: {
                bsonType: "string",
                description: "must be a string and is optional",
            },
            createdAt: {
                bsonType: "date",
                description: "must be a date and is required",
            },
        },
    },
};

module.exports = {
    logTwitterInteractionSchema,
    twitterInteractionSchema,
    airdropClaimSchema,
    promotionCodeSchema,
    userSchema,
    subscriptionInfoSchema,
};
