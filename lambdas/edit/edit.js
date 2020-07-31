const Uuid = require('uuid');

const Response = require('/opt/response.js');
const Database = require('/opt/database.js');

exports.handler = async (event) => {
    const response = new Response();
    const request = JSON.parse(event.body);

    const database = new Database(request.id);
    database.createQuery();
    response.message = [];
    for (const edit of request.edits) {
        let id;
        if (edit.action === 'add') {
            if (edit.type === 'proxy') {
                edit.value = { ...edit.value, usage: {}, fingerprints: [] };
            }
            id = Uuid.v4();
            response.message.push({ detail: `Added ${edit.type}`, id: id });
        } else if (edit.action === 'update') {
            id = edit.id;
            response.message.push({ detail: `Updated ${edit.type}`, id: id });
        } else if (edit.action === 'remove') {
            id = edit.id;
            response.message.push({ detail: `Removed ${edit.type}`, id: id });
        } 
        database.buildQuery(edit.action, edit.type, id, edit.value);     
    }
    try {
        await database.executeQuery();
    } catch (error) {
        response.status(500);
        response.error(error.message);
        return response.value;
    }

    response.status(200);
    return response.value;
};