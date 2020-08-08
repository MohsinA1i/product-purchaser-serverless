const Uuid = require('uuid');

const Response = require('/opt/response.js');
const Database = require('/opt/database.js');

exports.handler = async (event) => {
    const response = new Response();

    const userId = Uuid.v4();
    const database = new Database(userId);
    const user = createUser();
    response.message = { detail: "Registered user", id: userId };
    try {
        await database.createEntry(user);
    } catch (error) {
        response.status(500);
        response.error(error.message);
        return response.value;
    }
    
    response.status(201);
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
