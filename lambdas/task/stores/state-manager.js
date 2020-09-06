const Uuid = require(process.env.AWS_SAM_LOCAL ? 'uuid' : '/opt/node_modules/uuid');
const Useragent = require('user-agents');

const Database = require(process.env.AWS_SAM_LOCAL ? '/opt/nodejs/database.js' : '/opt/database.js');

class StateManager {
    constructor(userId) {
        this.database = new Database(userId);
    }

    static proxy = {
        BOTH: 0,
        DIRECT: 1,
        PROXY: 2
    }

    static save = {
        SAVE_SESSION: 0,
        DISPOSE_SESSION: 1,
        DISCARD_SESSION: 2
    }

    async load(sessionId) {
        this.data = await this.database.getEntry();

        this.sessionId = sessionId;
        this.session = this.data.session[this.sessionId];

        this.fingerprintId = this.session.fingerprint;
        this.fingerprint = this.data.fingerprint[this.fingerprintId];

        this._proxyId = this.fingerprint.proxy;
        this._proxy = this.data.proxy[this._proxyId];
        if (this._proxyId !== 'direct') {
            this.proxyId = this._proxyId;
            this.proxy = this._proxy;
        }
    }

    async create(hostname, proxy) {
        this.database.createQuery();

        this.data = await this.database.getEntry();
        this.setProxy(hostname, proxy);
        this.setFingerprint();
        this.createSession(hostname);

        await this.database.executeQuery();
    }

    setProxy(hostname, selection = StateManager.proxy.BOTH) {
        if (selection == StateManager.proxy.BOTH) {
            [this._proxyId, this._proxy] = this.findProxy(hostname, this.data.proxy, true);
        } else if (selection == StateManager.proxy.DIRECT) {
            [this._proxyId, this._proxy] = ['direct', this.data.proxy['direct']];
        } else if (selection == StateManager.proxy.PROXY) {
            [this._proxyId, this._proxy] = this.findProxy(hostname, this.data.proxy, false); 
            if (this._proxy === undefined) throw new Error('No proxy found');
        }

        let usage = this._proxy.usage;
        usage[hostname] = usage[hostname] ? ++usage[hostname] : 1;
        this.database.buildQuery('update', 'proxy', this._proxyId, {usage : usage});

        if (this._proxyId !== 'direct') {
            this.proxyId = this._proxyId;
            this.proxy = this._proxy;
        }
    }

    findProxy(hostname, proxies, direct) {
        let leastUsedProxyId;
        let leastUsedProxy;
        for (const proxyId in proxies) {
            const proxy = proxies[proxyId];
            if (proxy.status === 0) continue;

            if (proxyId === 'direct' && !direct) continue;

            if (proxy.usage[hostname] === undefined) {
                return [proxyId, proxy];
            } else if (leastUsedProxy === undefined || proxy.usage[hostname] < leastUsedProxy.usage[hostname]) {
                leastUsedProxyId = proxyId;
                leastUsedProxy = proxy;
            }
        }
        return [leastUsedProxyId, leastUsedProxy];
    }

    setFingerprint() {
        [this.fingerprintId, this.fingerprint] = this.findFingerprint(this._proxy.fingerprint, this.data.fingerprint);
        if (this.fingerprint === undefined) {
            const useragent = new Useragent({ deviceCategory: 'desktop' });
            const viewport = {
                width: useragent.data.screenWidth,
                height: useragent.data.screenHeight,
                deviceScaleFactor: 1.25
            };

            [this.fingerprintId, this.fingerprint] = [Uuid.v4(), { useragent: useragent.toString(), viewport: viewport, proxy: this._proxyId }];

            this._proxy.fingerprint.push(this.fingerprintId);
            this.database.buildQuery('update', 'proxy', this._proxyId, { fingerprint: this._proxy.fingerprint });
            this.database.buildQuery('add', 'fingerprint', this.fingerprintId, this.fingerprint);
        }
    }
      
    findFingerprint(fingerprintIds, fingerprints) {
        for (const id of fingerprintIds) {
            const fingerprint = fingerprints[id];
            if (!fingerprint.session) return [id, fingerprint];
        }
        return [undefined, undefined];
    }

    createSession(hostname) {
        [this.sessionId, this.session] = [Uuid.v4(), { details: { hostname: hostname }, fingerprint: this.fingerprintId }];

        this.database.buildQuery('update', 'fingerprint', this.fingerprintId, { session: this.sessionId });
        this.database.buildQuery('add', 'session', this.sessionId, this.session);
    }

    async save(selection = StateManager.save.DISCARD_SESSION) {
        this.database.createQuery();

        if (selection === StateManager.save.DISCARD_SESSION || selection === StateManager.save.DISPOSE_SESSION) {
            this.database.buildQuery('update', 'fingerprint', this.fingerprintId, { session: undefined });
            if (selection === StateManager.save.DISCARD_SESSION)
                this.database.buildQuery('update', 'fingerprint', this.fingerprintId, { cookies: this.fingerprint.cookies });
            else if (selection === StateManager.save.DISPOSE_SESSION && this.session.cookies) {
                const cookies = [ ...this.fingerprint.cookies, ...this.session.cookies];
                this.database.buildQuery('update', 'fingerprint', this.fingerprintId, { cookies: cookies });
            }
        }

        if (selection === StateManager.save.SAVE_SESSION) {
            const session = { details: this.session.details, cookies: this.session.cookies };
            this.database.buildQuery('update', 'session', this.sessionId, session);
        } else
            this.database.buildQuery('remove', 'session', this.sessionId);
        
        await this.database.executeQuery(this.data.id);
    }
}

module.exports = StateManager;