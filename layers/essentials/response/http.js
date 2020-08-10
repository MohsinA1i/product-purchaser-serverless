class Response {
    constructor() {
        this.response = {
            statusCode: 200,
            headers: { 'content-type': 'text/json' },
            body: {}
        }
    }

    set status(code) {
        this.response.statusCode = code;
    }

    get body() {
        return this.response.body;
    }

    get value() {
        this.response.body = JSON.stringify(this.response.body);
        return this.response;
    }
}

module.exports = Response;

