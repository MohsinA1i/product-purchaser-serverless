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
    const result = await taskManager.execute();
    response.body.warnings = result.warnings;
    if (result.error) {
        response.status = 500;
        response.body.error = result.error;
    }
    
    if (request.dispose) {
        try {
            await store.dispose();
        } catch (error) { response.warnings.push(error.message) }
    }
    response.body.session = await store.close();

    return response.value;
};