const WebSocket = require('ws');

const Connection = require('/opt/connection.js');

const StoreFactory = require('./stores/store-factory.js');
const TaskManager = require('./task-manager.js');

exports.handler = async (event) => {
    const websocket = new WebSocket(
        'ws://product-purchaser-gateway.us-east-1.elasticbeanstalk.com:8080',
        [],
        { "headers": { "function": event.functionId } }
    );
    const connection = new Connection(websocket);
    await connection.open();

    const request = event.body;

    const storeFactory = new StoreFactory();
    const options = {
        userId: request.id,
        session: request.session,
        proxy: request.proxy,
        captcha: request.captcha,
        account: request.account,
        headless: true
    };
    const store = storeFactory.getStore(request.hostname, options);
    await store.open();

    connection.onClose(async () => {
        if (request.dispose) await store.dispose();
        await store.close();
    })

    const taskManager = new TaskManager(store, request.tasks, connection);
    try {
        await taskManager.execute();
        connection.close(1000, 'Successful');
    } catch (error) { 
        connection.close(1001, error.message);
    }
};