const Aws = require('aws-sdk');
const DynamoDB = new Aws.DynamoDB.DocumentClient(process.env.AWS_SAM_LOCAL ? {endpoint: 'http://dynamodb:8000/'} : undefined);
const Table = process.env.TABLE_NAME;

class Database {
    constructor(userId) {
        this.userId = userId;
    }

    async getEntry() {
        return (await DynamoDB.get({ TableName: Table, Key: { id: this.userId } }).promise()).Item;
    }

    async createEntry(document) {
        return await DynamoDB.put({ TableName: Table, Item: {id: this.userId, ...document} }).promise();
    }

    createQuery() {
        this.query = {
            additions: {},
            updates: {},
            removes: {}
        }
    }

    buildQuery(action, type, id, document) {
        if (action === 'add') {
            const additions = this.query.additions;
            if (additions[type] === undefined) additions[type] = {};
            additions[type][id] = document;
        } else if (action === 'update') {
            let addition = this.query.additions[type];
            if (addition !== undefined) addition = addition[id];
            if (addition) {
                for (const attribute in document)
                    addition[attribute] = document[attribute];
            } else {
                const updates = this.query.updates;
                if (updates[type] === undefined) updates[type] = {};
                if (updates[type][id] === undefined) updates[type][id] = {};
                updates[type][id] = {...updates[type][id], ...document};
            }
        } else if (action === 'remove') {
            let addition = this.query.additions[type];
            if (addition !== undefined) addition = addition[id];
            if (addition) {
                delete this.query.additions[type][id];
            } else {
                const removes = this.query.removes;
                if (removes[type] === undefined) removes[type] = new Set();
                removes[type].add(id);
            }
        }
    }

    async executeQuery() {
        const params = { 
            TableName: Table, 
            Key: { id: this.userId },
            ...this._buildParams()
        };

        console.log(params);
        return await DynamoDB.update(params).promise();
    }

    _buildParams() {
        let setExpression = "";
        let removeExpression = "";
        let names = {
            names: {},
            count: 0
        }
        let values = {
            values: {},
            count: 0
        }

        for (const type in this.query.additions) {
            for (const id in this.query.additions[type]) {
                const document = this.query.additions[type][id];

                const _type = this._setName(names, type);
                const _id = this._setName(names, id);
                const _document = this._setValue(values, document);
                setExpression += `${_type}.${_id} = ${_document}, `;
            }
        }
        for (const type in this.query.updates) {
            for (const id in this.query.updates[type]) {
                const document = this.query.updates[type][id];

                const _type = this._setName(names, type);
                const _id = this._setName(names, id);
                for (const attribute in document) {
                    const _attribute = this._setName(names, attribute);
                    const _value = this._setValue(values, document[attribute]);
                    setExpression += `${_type}.${_id}.${_attribute} = ${_value}, `;
                }
            }
        }
        for (const type in this.query.removes) {
            for (const id of Array.from(this.query.removes[type])) {
                const _type = this._setName(names, type);
                const _id = this._setName(names, id);
                removeExpression += `${_type}.${_id}, `;
            }
        }

        if (setExpression.length === 0 && removeExpression.length === 0) return; 

        setExpression = setExpression.slice(0, -2);
        removeExpression = removeExpression.slice(0, -2);

        let updateExpression = "";
        if (setExpression.length > 0)
            updateExpression += `SET ${setExpression} `;
        if (removeExpression.length > 0)
            updateExpression += `REMOVE ${removeExpression} `;
        updateExpression = updateExpression.slice(0, -1);

        const params = { UpdateExpression: updateExpression };
        if (Object.keys(names.names).length > 0)
            params.ExpressionAttributeNames = names.names;
        if (Object.keys(values.values).length > 0)
            params.ExpressionAttributeValues = values.values;

        return params;
    }

    _setName(names, name) {
        let _name = Object.keys(names.names).find((key) =>
            names.names[key] === name);
        if (_name === undefined) {   
            _name = `#${++names.count}`;
            names.names[`${_name}`] = name;
        }
        return _name;
    }

    _setValue(values, value) {
        const _value = `:${++values.count}`;            
        values.values[`${_value}`] = value;
        return _value;
    }
}

module.exports = Database;