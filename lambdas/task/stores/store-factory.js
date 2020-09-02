class StoreFactory {
    static environment = {
        LOCAL: 0,
        AWS: 1
    }

    getStore(url, options = {}) {
        let hostname = url.match(/(?:https?:\/\/)?([^\/]+)/)[1];
        const domain = hostname.match(/(?:www\.)?([^\/.]+)/)[1];
        const supported = this.supportedStore(domain);
        if (supported) hostname = this.supportedHostname(domain);
        
        if (options.environment === StoreFactory.environment.AWS) {
            const Store = require('./aws/aws-store');
            return new Store(hostname);
        } else {
            if (supported) {
                const Store = require(`./local/profiles/${domain}`);
                return new Store(hostname);
            } else {
                const Store = require(`./local/profiles/generic`);
                return new Store(hostname);
            }
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