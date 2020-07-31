class StoreFactory {
    static proxy = {
        DIRECT: 0,
        RANDOM: 1,
        BOTH: 2
    }

    getStore(url, options) {
        const hostname = url.match(/(?:https?:\/\/)?([^\/]+)/)[1];
        const domain = hostname.match(/(?:www\.)?([^\/.]+)/)[1];
        const supported = this.supportedStore(domain);
        if (supported) {
            const Store = require(`./store/profiles/${domain}.js`);
            return new Store(options);
        } else {
            const Store = require(`./store/profiles/generic.js`);
            return new Store(hostname, options);
        }
    }

    supportedStore(domain) {
        if (domain === 'cncpts' ||
            domain === 'deadstock' ||
            domain === 'hanon-shop' ||
            domain === 'kith' ||
            domain === 'notre-shop' ||
            domain === 'shopnicekicks' ||
            domain === 'undefeated') {
            return true;
        }
        return false;
    }
}

module.exports = StoreFactory;