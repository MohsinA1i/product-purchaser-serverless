class Response {
    constructor(webSocket) {
        this.webSocket = webSocket;
    }

    async open() {
        await new Promise(resolve => {
            this.webSocket.on('open', () => { resolve() });
        });
    }

    send(type, message) {
        if (this.webSocket.readyState === 1) {
            this.webSocket.send(JSON.stringify({
                type: type,
                ...message
            }))
        }
    }

    close() {
        if (this.webSocket.readyState === 1)
            this.webSocket.close();
    }
}

module.exports = Response;

