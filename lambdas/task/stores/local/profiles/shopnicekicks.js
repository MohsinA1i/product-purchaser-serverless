const Store = require('../store')

class Nicekicks extends Store {
    constructor(hostname) {
        super(hostname);
    }

    params () {
        return {
            "headers": {
                "accept": "*/*",
                "accept-language": "en-US,en;q=0.9",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
              },
              "referrerPolicy": "no-referrer-when-downgrade",
              "mode": "cors",
              "credentials": "include"
        }
    }

    async cartRequest() {
        if (await this.where() === undefined) await this.goto('home');

        return await this.page.evaluate(async (params, url, referrer) => {
            params.referrer = referrer;
            params.body = null;
            params.method = "GET";

            const response = await fetch(url, params);
            try { 
                return await response.json();
            } catch (error) { throw new Error(response.status); };
        }, this.params(), `https://${this.hostname}/cart.js`, `https://${this.hostname}/`);
    }

    async clearRequest() {
        if (await this.where() === undefined) await this.goto('home');

        return await this.page.evaluate(async (params, url, referrer) => {
            params.referrer = referrer;
            params.body = null;
            params.method = "POST";

            const response = await fetch(url, params);
            try { 
                return await response.json();
            } catch (error) { throw new Error(response.status); };
        }, this.params(), `https://${this.hostname}/cart/clear.js`, `https://${this.hostname}/cart`);
    }

    async findRequest(keywords) {
        if (await this.where() === undefined) await this.goto('home');

        return await this.page.evaluate(async (params, url, referrer) => {
            params.referrer = referrer;
            params.body = null;
            params.method = "GET";

            const response = await fetch(url, params);
            try { 
                return await response.json();
            } catch (error) { throw new Error(response.status); };
        }, this.params(), `https://${this.hostname}/search/suggest.json?q=${keywords.join('%20')}&resources[type]=product`, `https://${this.hostname}/`);
    }
    
    async productRequest(handle, referrer) {
        if (await this.where() === undefined) await this.goto('home');

        return await this.page.evaluate(async (params, url, referrer) => {
            params.referrer = referrer;
            params.body = null;
            params.method = "GET";

            const response = await fetch(url, params);
            try { 
                return await response.json();
            } catch (error) { throw new Error(response.status); };
        }, this.params(), `https://${this.hostname}/products/${handle}.js`, `https://${this.hostname}${referrer}`);
    }

    async addRequest(id, quantity, referrer) {
        if (await this.where() === undefined) await this.goto('home');

        return await this.page.evaluate(async (params, url, body, referrer) => {
            params.headers["content-type"] = "application/json";
            params.headers["x-requested-with"] = "XMLHttpRequest";
            params.referrer = referrer;
            params.body = body;
            params.method = "POST";

            const response = await fetch(url, params);
            try { 
                return await response.json();
            } catch (error) { throw new Error(response.status); };
        }, this.params(), `https://${this.hostname}/cart/add.js`, `{ "id": "${id}", "quantity": "${quantity}" }`, `https://${this.hostname}${referrer}`);
    }
}

module.exports = Nicekicks;