class Response {
    constructor() {
        this.response = {
            statusCode: 200,
            headers: { 'content-type': 'text/json' },
            body: {
                warnings: []
            },
        }
    }

    status(code) {
        this.response.statusCode = code;
    }

    get message() {
        return this.response.body.message;
    }

    set message(message) {
        this.response.body.message = message;
    }

    warning(message) {
        this.response.body.warnings.push(message);
    }

    error(message) {
        this.response.body = { error: message };
    }

    get value() {
        return this.response;
    }
}

module.exports = Response;

