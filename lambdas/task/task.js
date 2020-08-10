const WebSocket = require('ws');

const Response = require('/opt/response/websocket.js');

const StoreFactory = require('./stores/store-factory.js');
const TaskManager = require('./task-manager.js');

exports.handler = async (event) => {
    const response = new Response(new WebSocket('ws://product-purchaser-gateway.us-east-1.elasticbeanstalk.com:8080',
    [], { "headers": { "function": event.functionId } }));
    await response.open();

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

    const taskManager = new TaskManager(store, request.tasks, response);
    await taskManager.execute();
    
    if (request.dispose) {
        try {
            await store.dispose();
        } catch (error) { 
            response.send('warning', { detail: error.message });
        }
    }
    response.body.session = await store.close();

    response.close();
};