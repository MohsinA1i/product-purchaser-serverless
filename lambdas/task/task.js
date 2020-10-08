const Connection = require(process.env.AWS_SAM_LOCAL ? '/opt/nodejs/connection' : '/opt/connection');

const StoreFactory = require('./stores/store-factory');
const TaskManager = require('./task-manager');

exports.handler = async (event) => {
    const connection = new Connection();
    await connection.open(
        process.env.AWS_SAM_LOCAL ?
        'ws://host.docker.internal:8080' :
        'ws://product-purchaser-gateway.us-east-1.elasticbeanstalk.com:8080',
        event.functionId
    );

    const request = event.body;

    const storeFactory = new StoreFactory();
    const store = storeFactory.getStore(request.hostname, { type: StoreFactory.type.BOT });
    store.setStatus = (status) => connection.send('status', { status: status });
    const options = {
        userId: request.id,
        session: request.session,
        requestDelay: request.requestDelay,
        proxy: request.proxy,
        captcha: request.captcha,
        account: request.account,
        headless: true
    };
    
    connection.onClose(async (code, reason) => {
        await store.close(request.save);
    });

    try {
        await store.open(options);
        const taskManager = new TaskManager();
        await taskManager.execute(store, request.tasks);
    } catch (error) {
        if (store.state === 0) connection.close(1000);
        else connection.close(1001, error.message);
    }
    await store.close(request.save);
};