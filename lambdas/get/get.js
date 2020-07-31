const Response = require('/opt/response.js');
const Database = require('/opt/database.js');

exports.handler = async (event) => {
    const response = new Response();
    const request = JSON.parse(event.body);

    const database = new Database(request.id);
    try {
        response.message = await database.getEntry();
    } catch (error) {
        response.status(500);
        response.error(error.message);
        return response.value;
    }

    response.status(200);
    return response.value;
};