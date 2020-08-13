const Connection = require(process.env.AWS_SAM_LOCAL ? '/opt/nodejs/connection.js' : '/opt/connection.js');

const StoreFactory = require('./stores/store-factory.js');
const TaskManager = require('./task-manager.js');

exports.handler = async (event) => {
    const connection = new Connection('wss://echo.websocket.org', event.functionId);
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
    });

    const taskManager = new TaskManager();
    try {
        await taskManager.execute(store, request.tasks, connection);
        connection.close(1000, '');
    } catch (error) { 
        connection.close(1001, error.message);
    }
};