const WebSocket = require('ws');

class Response {
    constructor(url, functionId) {
        this.webSocket = new WebSocket(url, [], { "headers": { "function": functionId } }); 
    }

    async open() {
        await new Promise(resolve => {
            this.webSocket.on('open', () => { resolve() });
        });
    }

    send(type, message) {
        if (this.webSocket.readyState === WebSocket.OPEN) {
            this.webSocket.send(JSON.stringify({
                type: type,
                ...message
            }))
        }
    }

    close() {
        this.webSocket.close();
    }
}

module.exports = Response;

