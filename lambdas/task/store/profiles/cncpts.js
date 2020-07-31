const Store = require('../store.js')

class Cncpts extends Store {
    constructor(options) {
        super("cncpts.com", options);
    }

    params () {
        return {
            "headers": {
                "accept": "application/json, text/javascript, */*; q=0.01",
                "accept-language": "en-US,en;q=0.9",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "x-requested-with": "XMLHttpRequest"
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
            return await response.json();
        }, this.params(), `https://${this.hostname}/cart.js`, `https://${this.hostname}/`);
    }

    
    async productRequest(handle, referrer) {
        if (await this.where() === undefined) await this.goto('home');

        try {
            return await this.page.evaluate(async (params, url, referrer) => {
                params.referrer = referrer;
                params.body = null;
                params.method = "GET";

                const response = await fetch(url, params);
                return await response.json();
            }, this.params(), `https://${this.hostname}/products/${handle}.js`, `https://${this.hostname}${referrer}`);
        } catch (error) { throw new Error(`No product '${handle}'`); }
    }

    async addRequest(id, quantity, referrer) {
        if (await this.where() === undefined) await this.goto('home');

        const response = await this.page.evaluate(async (params, url, body, referrer) => {
            params.headers["content-type"] = "application/x-www-form-urlencoded; charset=UTF-8";
            params.referrer = referrer;
            params.body = body;
            params.method = "POST";

            const response = await fetch(url, params);
            return await response.json();
        }, this.params(), `https://${this.hostname}/cart/add.js`, `id=${id}&quantity=${quantity}`, `https://${this.hostname}${referrer}`);
        if (response.status) throw new Error(response.description);
        return response;
    }

    async clearRequest() {
        if (await this.where() === undefined) await this.goto('home');

        return await this.page.evaluate(async (params, url, referrer) => {
            params.referrer = referrer;
            params.body = null;
            params.method = "POST";

            const response = await fetch(url, params);
            return await response.json();
        }, this.params(), `https://${this.hostname}/cart/clear.js`, `https://${this.hostname}/cart`);
    }
}

module.exports = Cncpts;