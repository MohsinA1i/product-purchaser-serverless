const Store = require('../store.js')

class Undefeated extends Store {
    constructor() {
        super("undefeated.com");
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
            params["content-type"] = "application/json"
            params.referrer = referrer;
            params.body = null;
            params.method = "GET";

            const response = await fetch(url, params);
            return await response.json();
        }, this.params(), `https://${this.hostname}/cart.js`, `https://${this.hostname}/`);
    }

    async clearRequest() {
        if (await this.where() === undefined) await this.goto('home');

        return await this.page.evaluate(async (params, url, referrer) => {
            params["content-type"] = "application/json"
            params.referrer = referrer;
            params.body = null;
            params.method = "POST";

            const response = await fetch(url, params);
            return await response.json();
        }, this.params(), `https://${this.hostname}/cart/clear.js`, `https://${this.hostname}/cart`);
    }

    async findRequest(keywords) {
        if (await this.where() === undefined) await this.goto('home');

        return await this.page.evaluate(async (params, url, referrer) => {
            params["content-type"] = "application/json"
            params.referrer = referrer;
            params.body = null;
            params.method = "GET";

            const response = await fetch(url, params);
            return await response.json();
        }, this.params(), `https://${this.hostname}/search/suggest.json?q=${keywords.join('%20')}&resources[type]=product`, `https://${this.hostname}/`);
    }
    
    async productRequest(handle, referrer) {
        if (await this.where() === undefined) await this.goto('home');

        try {
            return await this.page.evaluate(async (params, url, referrer) => {
                params["content-type"] = "application/json"
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

        const body = "------WebKitFormBoundaryB2eEAErUoWqYssua\r\nContent-Disposition: form-data; name=\"form_type\"\r\n\r\nproduct\r\n------WebKitFormBoundaryB2eEAErUoWqYssua\r\nContent-Disposition: form-data; name=\"utf8\"\r\n\r\n✓\r\n------WebKitFormBoundaryB2eEAErUoWqYssua\r\nContent-Disposition: form-data; name=\"id\"\r\n\r\n" + id + "\r\n------WebKitFormBoundaryB2eEAErUoWqYssua--\r\n"

       const response = await this.page.evaluate(async (params, url, body, referrer) => {
            params.headers["content-type"] = "multipart/form-data; boundary=----WebKitFormBoundaryB2eEAErUoWqYssua";
            params.referrer = referrer;
            params.body = body;
            params.method = "POST";

            const response = await fetch(url, params);
            return await response.json();
        }, this.params(), `https://${this.hostname}/cart/add.js`, body, `https://${this.hostname}${referrer}`);
        if (response.status) throw new Error(response.description);
        return response;
    }
}

module.exports = Undefeated;