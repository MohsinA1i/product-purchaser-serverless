const Connection = require(process.env.AWS_SAM_LOCAL ? '/opt/nodejs/connection.js' : '/opt/connection.js');

const StoreFactory = require('./stores/store-factory.js');
const TaskManager = require('./task-manager.js');

exports.handler = async (event) => {
    const connection = new Connection(
        process.env.AWS_SAM_LOCAL ? 'ws://host.docker.internal:8080' : 'ws://product-purchaser-gateway.us-east-1.elasticbeanstalk.com:8080',
        event.functionId
    );
    await connection.open();

    const request = event.body;

    const storeFactory = new StoreFactory();
    const store = storeFactory.getStore(request.hostname);
    const options = {
        userId: request.id,
        session: request.session,
        proxy: request.proxy,
        captcha: request.captcha,
        account: request.account,
        headless: true
    };
    await store.open(options);

    connection.onClose(async (code, reason) => {
        await store.close(StoreFactory.save.DISCARD_SESSION);
    });

    const taskManager = new TaskManager();
    const error = await taskManager.execute(store, request.tasks, connection);
    
    await store.close(request.save);
    if (error)
        connection.close(1001, error.message);
    else 
        connection.close(1000, '');
};