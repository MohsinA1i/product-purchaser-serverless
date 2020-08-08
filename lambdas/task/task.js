const Response = require('/opt/response.js');
const StoreFactory = require('./stores/store-factory.js');
const TaskManager = require('./task-manager.js');

exports.handler = async (event) => {
    const response = new Response();
    const request = JSON.parse(event.body);

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

    const taskManager = new TaskManager(store, request.tasks);
    response.message = taskManager.execute();

    if (request.dispose) await store.dispose();
    response.message.session = await store.close();

    response.status(200);
    return response.value;
};