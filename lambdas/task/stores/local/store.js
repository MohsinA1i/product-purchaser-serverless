const Regex = require('../regex');
const Site = require('./site');

class Store extends Site {
    constructor(hostname) {
        super(hostname);
    }

    async login(account) {
        this.setStatus(Site.status.LOGIN);
        let here = await this.goto('account');
        if (here === 'account') return;

        const fields = {
            'email':  account.email,
            'password': account.password
        }
        for (const field in fields)  {
            await this.page.$eval(`form[action="/account/login"] [name="customer[${field}]"]`, (element, value) => element.value = value, fields[field])
        }

        this.override.email = account.email;
        this.override.password = account.password;
        await Promise.all([
            this.click('form[action="/account/login"] [type="submit"]'),
            this.page.waitForNavigation({ timeout: this.timeout, waitUntil: "domcontentloaded" })
        ]);  

        here = await this.where();
        if (here === 'checkpoint' || here === 'challenge') {
            await this._navigateCheckpoint();
            here = await this.where();
        }

        if (here === 'login') {
            throw new Error('Login Failed');
        } else {
            this.stateManager.session.details.account = account;
        }
    }

    async logout() {
        const here = await this.goto('account');
        if (here === 'login') return;

        await Promise.all([
            this.click('[href="/account/logout"]'),
            this.page.waitForNavigation({ timeout: this.timeout, waitUntil: "domcontentloaded" })
        ]);   

        delete this.stateManager.session.details.account;
    }

    async getCart() {
        const response = await this.cartRequest();

        const items = response.items.map(item => {
            return {
                id: item.id,
                name: item.product_title,
                size: item.variant_title,
                price: item.price,
                quantity: item.quantity,
                path: Regex.removeQuery(item.url),
                image: item.image
            };
        });

        if (items.length > 0) {
            const cart = {}
            for (const item of items) cart[item.id] = item;
            this.stateManager.session.details.cart = cart;
        } else 
            delete this.stateManager.session.details.cart;

        return this.stateManager.session.details.cart;
    }

    async emptyCart() {
        await this.clearRequest();
        delete this.stateManager.session.details.cart;
    }

    async searchKeywords(keywords, retry = true) {
        this.setStatus(Site.status.KEYWORDS);
        while (true) {
            const products = (await this.findRequest(keywords)).resources.results.products;
            if (products.length == 0) {
                if (retry) {
                    await new Promise(resolve => setTimeout(resolve(), this.options.requestDelay));
                    continue;
                } else throw new Error('No product matching keywords');
            }
            const product = products[0];
            return {
                id: product.id,
                name: product.title,
                price: product.price,
                path: Regex.removeQuery(product.url),
                image: product.image
            }
        }
    }

    async addToCart(path, size, quantity = 1, retry = true) {
        this.setStatus(Site.status.STOCK);
        path = Regex.getPathAndQuery(path);
        const handle = Regex.getEndpoint(path);
        while (true) {
            let product = await this.productRequest(handle, path);

            let variant;
            if (size) {
                variant = product.variants.find(variant => variant.available && 
                    (variant.option1 === size ||
                    variant.option2 === size ||
                    variant.option3 === size)); 
            } else {
                variant = product.variants.find((variant) => variant.available);
            }
            if (variant === undefined) {
                if (retry) {
                    await new Promise(resolve => setTimeout(resolve(), this.options.requestDelay));
                    continue;
                } else if (size) throw new Error(`Product ${product.title} is not available in size ${size}`);
                else throw new Error(`Product ${product.title} is not available`);
            }

            let response = await this.addRequest(variant.id, quantity, path);
            if (response.status) {
                if (retry) {
                    await new Promise(resolve => setTimeout(resolve(), this.options.requestDelay));
                    continue;
                } else throw new Error(response.description);
            } else product = response;

            const item = {
                id: product.product_id,
                name: product.product_title,
                size: product.variant_title,
                price: product.price,
                quantity: product.quantity,
                path: Regex.removeQuery(product.url),
                image: product.image
            }
            if (this.stateManager.session.details.cart === undefined) this.stateManager.session.details.cart = {};
            this.stateManager.session.details.cart[variant.id] = item;
            return item;
        }
    }

    async setContact(contact) {
        await this.goto('contact_information');
        await this._handleContact(contact);
        this.stateManager.session.details.contact = contact;
    }

    async setCoupon(coupon) {
        const here = await this.where();
        if (here !== 'contact_information' && here !== 'shipping_method' && here !== 'payment_method')
            await this.goto('contact_information');
        return await this._handleCoupon(coupon);
    }

    async setShipping() {
        await this.goto('shipping_method');
        await this._checkContact();
        await this._handleShipping();
        this.stateManager.session.details.shipping = 0;
    }

    async submitPayment(card, contact) {
        await this.goto('payment_method');
        await this.page.waitForSelector('.review-block', { timeout: 0 });
        await this._checkContact();   
        await this._checkShipping();
        await this._handleBilling(contact);
        await this._handlePayment(card);

        await this._navigatePayment();
    }

    async dispose() {
        if (this.stateManager.session.details.cart) await this.emptyCart();
        if (this.stateManager.session.details.account) await this.logout();
    }

    async _checkContact() {
        const error = new Error('Contact information not set');
        const elements = (await this.page.$x('//div[contains(text(),"Ship to")]/following-sibling::div'));
        if (elements.length == 0) throw error;
        else {
            const address = await this.page.evaluate(element => element.textContent.trim(), elements[0]);
            if (address.length == 0) throw error;
        }
    }

    async _checkShipping() {
        const error = new Error('Shipping method not set');
        const elements = (await this.page.$x('//div[contains(text(),"Method")]/following-sibling::div'));
        if (elements.length == 0) throw error;
    }

    async _handleContact(contact) {
        this.setStatus(Site.status.CONTACT);
        const fields = {
            'checkout_shipping_address_first_name': contact.firstName,
            'checkout_shipping_address_last_name': contact.lastName,
            'checkout_shipping_address_city': contact.city,
            'checkout_shipping_address_zip': contact.postalCode
        }

        await this.page.evaluate((email) => {
            let element = document.querySelector('#checkout_email');
            if (element === null) element = document.querySelector('#checkout_email_or_phone');
            element.value = email;
        }, contact.email);

        await this.page.evaluate((address, address2) => {
            let element = document.querySelector('#checkout_shipping_address_address2');
            if (element === null) address = `${address} ${address2}`;
            else element.value = address2;
            element = document.querySelector('#checkout_shipping_address_address1');
            element.value = address;
        }, contact.address, contact.address2);

        await this.page.evaluate((company) => {
            let element = document.querySelector('#checkout_shipping_address_company');
            if (element && element.hasAttribute('aria-required')) element.value = company;
        }, contact.company);

        let valid = await this.page.evaluate((country) => {
            return document.querySelector(`#checkout_shipping_address_country [value="${country}"]`) !== null;
        }, contact.country);
        if (!valid) throw new Error('Unexpected value for country');
        await this.page.select('#checkout_shipping_address_country', contact.country);

        valid = await this.page.$eval('#checkout_shipping_address_province', (element, state) => {
                if (element.disabled) return true;
                const option = element.querySelector(`[data-alternate-values*='"${state}"']`);
                if (option) element.value = option.value;
                return option !== null;
            }, contact.state);
        if (!valid) throw new Error('Unexpected value for state');

        await this.page.evaluate((phone) => {
            let element = document.querySelector('#checkout_shipping_address_phone');
            if (element) element.value = phone;
        }, contact.phone);

        for (const field in fields) {
            const value = fields[field];
            await this.page.$eval(`#${field}`, (element, value) => element.value = value, value);
        }

        await this.waitForReCaptcha();

        this.override.email = contact.email;
        await Promise.all([
            this.click('#continue_button'),
            this.page.waitForNavigation({ timeout: this.timeout, waitUntil: "domcontentloaded" })
        ]);

        this.contact = contact;
    }

    async _handleShipping() {
        this.setStatus(Site.status.SHIPPING);
        await this.page.waitForFunction(() => !document.getElementById('continue_button').hasAttribute('disabled'),
            { timeout: 0, polling: 'mutation' });
        await new Promise(resolve => setTimeout(resolve, 200));
        await Promise.all([
            this.click('#continue_button'),
            this.page.waitForNavigation({ timeout: this.timeout, waitUntil: "domcontentloaded" })
        ]);
    }

    async _handleCoupon(coupon) {
        this.setStatus(Site.status.COUPON);
        const missing = await this.page.evaluate(() => {
            return document.querySelector(`[name="checkout[reduction_code]"]`) === null;
        });
        if (missing) throw new Error('Coupons not supported')
        await this.page.$eval('[name="checkout[reduction_code]"]', (element, coupon) => {
            element.value = coupon;
        }, coupon);
        await Promise.all([
            this.page.evaluate(() => {
                const path = '//input[@name="checkout[reduction_code]"]/ancestor::form//*[@type="submit"]';
                const element = document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                element.removeAttribute('disabled');
                element.click();
            }),
            this.page.waitForResponse(response => {
                const request = response.request();
                if (request.method() === 'POST'  && request.postData().includes('reduction_code')) return true;
                else return false;
            }, { timeout: this.timeout })
        ]);
    }

    async _handleBilling(contact) {
        const missing = await this.page.evaluate(() => {
            const radio = document.querySelector(`#checkout_different_billing_address_true`);
            if (radio) return radio.offsetParent === null;
            else return true;
        });
        if (missing) {
            if (contact) throw new Error('Billing information is not supported');
            return;
        } else {
            if (contact) await this.page.click('#checkout_different_billing_address_true');
            else { return await this.page.click('#checkout_different_billing_address_false'); }
        }

        const fields = {
            'checkout_billing_address_first_name': contact.firstName,
            'checkout_billing_address_last_name': contact.lastName,
            'checkout_billing_address_city': contact.city,
            'checkout_billing_address_zip': contact.postalCode
        }

        await this.page.evaluate((address, address2) => {
            let element = document.querySelector('#checkout_billing_address_address2');
            if (element === null) address = `${address} ${address2}`;
            else element.value = address2;
            element = document.querySelector('#checkout_billing_address_address1');
            element.value = address;
        }, contact.address, contact.address2);

        await this.page.evaluate((company) => {
            let element = document.querySelector('#checkout_billing_address_company');
            if (element && element.hasAttribute('aria-required')) element.value = company;
        }, contact.company);

        let valid = await this.page.evaluate((country) => {
            return document.querySelector(`#checkout_billing_address_country [value="${country}"]`) !== null;
        }, contact.country);
        if (!valid) throw new Error('Unexpected value for country');
        await this.page.select('#checkout_billing_address_country', contact.country);

        valid = await this.page.$eval('#checkout_billing_address_province', (element, state) => {
                if (element.disabled) return true;
                const option = element.querySelector(`[data-alternate-values*='"${state}"']`);
                if (option) element.value = option.value;
                return option !== null;
            }, contact.state);
        if (!valid) throw new Error('Unexpected value for state');

        await this.page.evaluate((phone) => {
            let element = document.querySelector('#checkout_billing_address_phone');
            if (element) element.value = phone;
        }, contact.phone);
        
        for (const field in fields) {
            const value = fields[field];
            await this.page.$eval(`#${field}`, (element, value) => element.value = value, value);
        }
    }

    async _handlePayment(card) {
        this.setStatus(Site.status.PAYMENT);
        const fields = {
            'number': card.number,
            'name': card.name,
            'expiry': card.expiry,
            'verification_value': card.cvv
        };

        for (const field in fields) {
            const frameElement = await this.page.$(`iframe[id^="card-fields-${field}"]`);
            const frame = await frameElement.contentFrame();
            await frame.waitForFunction(() => document.readyState === 'complete', { timeout: this.timeout, polling: 'mutation' });
            await frame.waitForFunction((field) => document.querySelector(`#${field}`).hasAttribute('style'),
            { timeout: this.timeout, polling: 'mutation' }, field);
            await frame.$eval(`#${field}`, (element, value) => element.value = value, fields[field]);
        }

        await Promise.all([
            this.click('.shown-if-js #continue_button'),
            this.page.waitForNavigation({ timeout: this.timeout, waitUntil: "domcontentloaded" })
        ]);
    }

    async _handleFailure() {
        return await this.page.evaluate(() => {
            const notice = document.querySelector('.notice:not(.hidden)');
            if (notice !== null) return notice.textContent.trim();
        });
    }

    async goto(to) {
        const here = await this.where();
        if (here === to || (to === 'account' && here === 'login')) {
            return here;
        } else if (here === 'contact_information' && this.contact) {
            await this._handleContact(this.contact);
        } else if (here === 'shipping_method') {
            await this._handleShipping();
        } else if (here === 'cloudflare') {
            await this.navigateCloudflare();
        } else if (here === 'limited') {
            throw new Error('Rate limited')
        } else if (here === 'checkpoint' || here === 'challenge') {
            await this._navigateCheckpoint();
        } else if (here === 'queue') {
            await this._navigateQueue();
        } else if (here === 'cart') {
            await this._navigateCart();
        } else if (here === 'login') {
            await this._navigateLogin();
        } else if (here === 'stock_problems') {
            await this._navigateStockProblem();
        } else if (here === 'processing') {
            await this._navigateProcessing();
        } else {
            await this._goto(to);
        }
        return await this.goto(to);
    }

    async _goto(to) {
        if (to === 'home') {
            await super.goto('/');
        } else if (to === 'account') {
            await super.goto(`/account`);
        } else if (to === 'contact_information') {
            await super.goto(`/checkout?step=contact_information`);
        } else if (to === 'shipping_method') {
            await super.goto(`/checkout?step=shipping_method`);
        } else if (to === 'payment_method') {
            await super.goto(`/checkout?step=payment_method`);
        }
    }

    async _navigateCheckpoint() {
        await this.waitForReCaptcha();
        await Promise.all([
            this.page.evaluate(() => {
                const path = '//div[@class="g-recaptcha"]/ancestor::form//*[@type="submit"]';
                const element = document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                element.click();
            }),
            this.page.waitForNavigation({ timeout: this.timeout, waitUntil: "domcontentloaded" })
        ]);
    }

    async _navigateQueue() {
        this.setStatus(Site.status.QUEUE);
        await this.page.waitForNavigation({ timeout: 0, waitUntil: "domcontentloaded" });
    }

    async _navigateCart() {
        const cart = await this.getCart();
        if (cart === undefined) throw new Error('Empty cart');
    }

    async _navigateLogin() {
        if (this.options.account) {
            await this.login(this.options.account);
        } else throw new Error('Login required');
    }

    async _navigateStockProblem() {
        await Promise.all([
            this.click('#continue_button'),
            this.page.waitForNavigation({ timeout: this.timeout, waitUntil: "domcontentloaded" })
        ]);
    }

    async _navigatePayment() {
        const here = await this.where();
        if (here === 'payment_method') {
            this.stateManager.session.details.payment = 1;
            throw new Error(await this._handleFailure());
        } else if (here === 'thank_you') {
            this.stateManager.session.details.payment = 0;
            this.setStatus(Site.status.SUCCESS);
        } else {
            await this.page.waitForNavigation({ timeout: 0, waitUntil: "domcontentloaded" });
            await this._navigatePayment();
        }
    }
}

module.exports = Store;
