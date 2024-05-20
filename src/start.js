const cluster = require('cluster');
const os = require('os');
const { server, SERVER_PORT } = require('./server');

if (!process.env.DOCKER_ENV) {
    require('dotenv').config();
}

const airdropRecipientAddress = `http://${process.env.AIRDROP_SERVER_HOST}:${process.env.AIRDROP_SERVER_PORT}/v1/info/recipient_info`;

if (cluster.isMaster) {
    // Master process
    const cpuCount = os.cpus().length; // Get the number of CPUs

    // Create a worker for each CPU
    for (let i = 0; i < cpuCount; i += 1) {
        cluster.fork();
    }

    // Listen for dying workers and replace them
    cluster.on('exit', (worker) => {
        console.log('Worker %d died', worker.id);
        cluster.fork();
    });
} else {
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`Error: Port ${SERVER_PORT} is already in use.`);
        } else {
            console.error(`Server error: ${error.message}`);
        }
        process.exit(1); // terminate the program
    });

    // Worker process - start the server
    server.listen(SERVER_PORT, () => {
        console.log(`Server is running on port ${SERVER_PORT}`);
        console.log('API docs available at /api-docs');

        // Send a GET request when the server starts
        // Endpoint: /recipient_info
        fetch(airdropRecipientAddress)
            .then(res => res.json()) // parse response as JSON
            .then(body => {
                if (body.code !== 0) {
                    console.error(body.error);
                    process.exit(1); // terminate the program
                }
                console.log(`GET request sent to ${airdropRecipientAddress}. Response: ${JSON.stringify(body)}`);
            })
            .catch(err => {
                console.error(`Error sending GET request: ${err.message}`);
                process.exit(1); // terminate the program
            });
    });
}
