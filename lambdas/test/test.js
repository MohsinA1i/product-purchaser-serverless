const Connection = require('/opt/nodejs/connection.js');

exports.handler = async (event) => {
    const connection = new Connection('ws://product-purchaser-gateway.us-east-1.elasticbeanstalk.com:8080', event.functionId);
    await connection.open();
    
    connection.onClose(() => {
        throw new Error('Connection closed');
    })
    
    connection.send('info', { 'detail': 'running' });
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    connection.close();
};
