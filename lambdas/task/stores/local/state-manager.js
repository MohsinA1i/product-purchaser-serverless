const Uuid = require('uuid');
const Useragent = require('user-agents');

const Database = require('/opt/database.js');

class StateManager {
    constructor(userId) {
        this.database = new Database(userId);
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

    setProxy(hostname, selection) {
        if (selection == 0) {
            [this._proxyId, this._proxy] = ['direct', this.data.proxy['direct']];
        } else if (selection == 1) {
            [this._proxyId, this._proxy] = this.findProxy(hostname, this.data.proxy, false); 
            if (this._proxy === undefined) throw new Error('No proxy found');
        } else {
            [this._proxyId, this._proxy] = this.findProxy(hostname, this.data.proxy, true);
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
            if (proxyId === 'direct' && !direct) 
                continue;

            const proxy = proxies[proxyId];
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

    async save() {
        this.database.createQuery();

        if (this.session) {
            const sessionUpdate = {
                details: this.session.details,
                cookies: this.session.cookies
            }
            this.database.buildQuery('update', 'session', this.sessionId, sessionUpdate);
        } else {
            const fingerprintUpdate = { cookies: this.fingerprint.cookies, session: undefined };
            this.database.buildQuery('remove', 'session', this.sessionId);
            this.database.buildQuery('update', 'fingerprint', this.fingerprintId, fingerprintUpdate);
        }
        

        await this.database.executeQuery(this.data.id);
    }
}

module.exports = StateManager;