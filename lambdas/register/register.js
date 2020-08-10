const Uuid = require('uuid');

const Response = require('/opt/http-response.js');
const Database = require('/opt/database.js');

exports.handler = async (event) => {
    const response = new Response();

    const userId = Uuid.v4();
    const database = new Database(userId);
    const user = createUser();
    try {
        await database.createEntry(user);
        response.status = 201;
        response.body.detail = 'Registered user';
        response.body.id = userId;
    } catch (error) {
        response.status = 500;
        response.body.error = error.message;
    }
    
    return response.value;
};

function createUser() {
    const user = {
        account: {},
        contact: {},
        proxy: {
            direct: { usage: {}, fingerprint: [] }
        },
        fingerprint: {},
        session: {}
    };

    return user;
}
