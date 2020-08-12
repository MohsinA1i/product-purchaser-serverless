const WebSocket = require(process.env.AWS_SAM_LOCAL ? 'ws' : '/opt/node_modules/ws');

class Connection {
    constructor(url, functionId) {
        this.webSocket = new WebSocket(url, [], { "headers": { "function": functionId } });
    }

    open() {
        return new Promise((resolve, reject) => {
            this.webSocket.on('open', () => { resolve() });
            this.webSocket.on('error', (error) => { reject(error) });
        });
    }

    send(type, message) {
        return new Promise(resolve => {
            this.webSocket.send(JSON.stringify({
                type: type,
                ...message
            }), undefined, () => { resolve() })
        })
    }

    onClose(end) {
        this.webSocket.on('close', (code, error) => {
            end();
        });
    }

    close(code, reason) {
        if (this.webSocket.readyState === 1)
            this.webSocket.close(code, reason);
    }
}

module.exports = Connection;

