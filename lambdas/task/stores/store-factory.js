class StoreFactory {
    static type = {
        MANUAL: 0,
        BOT: 1,
        BOT_CLOUD: 2
    }

    getStore(url, options = {}) {
        let hostname = url.match(/(?:https?:\/\/)?([^\/]+)/)[1];
        const domain = hostname.match(/(?:www\.)?([^\/.]+)/)[1];
        const supported = this.supportedStore(domain);
        if (supported) hostname = this.supportedHostname(domain);
        
        if (options.type === StoreFactory.type.MANUAL) { 
            const Store = require('./local/site');
            return new Store(hostname);
        } else if (options.type === StoreFactory.type.BOT) {
            if (supported) {
                const Store = require(`./local/profiles/${domain}`);
                return new Store(hostname);
            } else {
                const Store = require(`./local/profiles/generic`);
                return new Store(hostname);
            }
        } else if (options.type === StoreFactory.type.BOT_CLOUD) {
            const Store = require('./aws/aws-store');
            return new Store(hostname);
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

    supportedHostname(domain) {
        if (domain === 'cncpts')
            return 'cncpts.com'
        else if (domain === 'deadstock')
            return 'www.deadstock.ca'
        else if (domain === 'hanon-shop')
            return 'www.hanon-shop.com'
        else if (domain === 'kith')
            return 'kith.com'
        else if (domain === 'notre-shop')
            return 'www.notre-shop.com'
        else if (domain === 'shopnicekicks')
            return 'shopnicekicks.com'
        else if (domain === 'undefeated')
            return 'undefeated.com'
    }
}

module.exports = StoreFactory;