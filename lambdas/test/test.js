const Connection = require(process.env.AWS_SAM_LOCAL ? '/opt/nodejs/connection.js' : '/opt/connection.js');

exports.handler = async (event) => {
    const connection = new Connection();
    await connection.open('ws://product-purchaser-gateway.us-east-1.elasticbeanstalk.com:8080', event.functionId);
    
    connection.onClose(() => {
        throw new Error('Connection closed');
    })
    
    connection.send('info', { 'detail': 'running' });
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    connection.close();
};
