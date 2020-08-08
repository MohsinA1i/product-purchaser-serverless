const Site = require('./site.js');

class Store extends Site {
    constructor(hostname, options) {
        super(hostname, options);
    }

    async login(account) {
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
            this.state.session.details.account = account;
        }
    }

    async logout() {
        const here = await this.goto('account');
        if (here === 'login') return;

        await Promise.all([
            this.click('[href="/account/logout"]'),
            this.page.waitForNavigation({ timeout: this.timeout, waitUntil: "domcontentloaded" })
        ]);   

        delete this.state.session.details.account;
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
                path: item.url.match(/[^?]+/)[0],
                image: item.image
            };
        });

        if (items.length > 0) {
            const cart = {}
            for (const item of items) cart[item.id] = item;
            this.state.session.details.cart = cart;
        } else 
            delete this.state.session.details.cart;

        return this.state.session.details.cart;
    }

    async addToCart(path, size, quantity = 1) {
        path = path.match(/(?:https?:\/\/)?(?:[^\/]+)([^\s]+)/)[1];
        const handle = path.match(/([^\/\?]*)(?:\?[^?]*)?$/)[1];
        let product =  await this.productRequest(handle, path);

        let id;
        if (size === undefined) {
            const variant = product.variants.find((variant) => variant.available);
            if (variant === undefined) throw new Error(`Product ${product.title} is not available`);
            id = variant.id;
        } else {
            const variant = product.variants.find(variant => variant.option1 === size ||
                variant.option2 === size ||
                variant.option3 === size); 
            if (variant === undefined) throw new Error(`Product ${product.title} has no size ${size}'`);
            if (variant.available === false) throw new Error(`Product ${product.title} is not available in size ${size}`)
            id = variant.id;
        }

        product = await this.addRequest(id, quantity, path);

        const item = {
            id: product.id,
            name: product.product_title,
            size: product.variant_title,
            price: product.price,
            quantity: product.quantity,
            path: product.url.match(/[^?]+/)[0],
            image: product.image
        }
        if (this.state.session.details.cart === undefined) this.state.session.details.cart = {};
        this.state.session.details.cart[id] = item;
        return item;
    }

    async emptyCart() {
        await this.clearRequest();
        delete this.state.session.details.cart;
    }

    async setContact(contact) {
        await this.goto('contact_information');
        await this._handleContact(contact);
        this.state.session.details.contact = contact;

        return this.warnings;
    }

    async setCoupon(coupon) {
        const here = await this.where();
        if (here !== 'contact_information' && here !== 'shipping' && here !== 'payment')
            await this.goto('contact_information');
        return await this._handleCoupon(coupon);
    }

    async setShipping() {
        await this.goto('shipping');
        await this._checkContact();
        await this._handleShipping();
        this.state.session.details.shipping = 0;

        return this.warnings;
    }

    async submitPayment(card, contact) {
        await this.goto('payment');
        await this._checkContact();   
        await this._checkShipping();
        await this._handleBilling(contact);
        await this._handlePayment(card);

        let here = await this.where();
        if (here === 'processing') {
            await this._navigateProcessing();
            here = await this.where();
        }

        if (here === 'payment') {
            this.state.session.details.payment = 1;
            throw new Error(await this._handleFailure());
        } else if (here === 'thank_you') {
            this.state.session.details.payment = 0;
        }

        return this.warnings;
    }

    async dispose() {
        if (this.state.session.details.cart) await this.emptyCart();
        if (this.state.session.details.account) await this.logout();
        super.dispose();
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
            if (element) element.value = company;
        }, contact.company);

        try {
            await this.page.select('#checkout_shipping_address_country', contact.country);
        } catch (error) { throw new Error('Unexpected value for country'); }

        try {
            await this.page.$eval('#checkout_shipping_address_province', (element, state) => {
                if (element.disabled) return;
                element.value = element.querySelector(`[data-alternate-values*="${state}"]`).value;
            }, contact.state);
        } catch (error) { throw new Error('Unexpected value for state'); }

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
    }

    async _handleShipping() {
        await this.page.waitForFunction(() => !document.getElementById('continue_button').hasAttribute('disabled'),
            { timeout: 0, polling: 'mutation' });
        await new Promise(resolve => setTimeout(resolve, 200));
        await Promise.all([
            this.click('#continue_button'),
            this.page.waitForNavigation({ timeout: this.timeout, waitUntil: "domcontentloaded" })
        ]);
    }

    async _handleCoupon(coupon) {
        try {
            await this.page.$eval('[name="checkout[reduction_code]"]', (element, coupon) => {
                element.value = coupon;
            }, coupon);
        } catch (error) { throw new Error('Coupons not supported') }
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
        try {
            if (contact === undefined) {  
                return await this.page.click('#checkout_different_billing_address_false');
            } else {
                await this.page.click('#checkout_different_billing_address_true');
            }
        } catch (error) { return; }

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
            if (element) element.value = company;
        }, contact.company);

        try {
            await this.page.select('#checkout_billing_address_country', contact.country);
        } catch (error) { throw new Error('Unexpected value for country'); }

        try {
            await this.page.$eval('#checkout_billing_address_province', (element, state) => {
                if (element.disabled) return;
                element.value = element.querySelector(`[data-alternate-values*="${state}"]`).value;
            }, contact.state);
        } catch (error) { throw new Error('Unexpected value for state'); }

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
        } else if (to === 'shipping') {
            await super.goto(`/checkout?step=shipping_method`);
        } else if (to === 'payment') {
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
        const items = this.page.$$eval('.stock-problem-table tbody tr', elements => elements.map(element => {
            return {
                name: element.querySelector('.product__description__name').textContent,
                size: element.querySelector('.product__description__variant').textContent,
                status: element.querySelector('.product__status').textContent.trim()
            }
        }));

        if (this.warnings === undefined) this.warnings = [];
        this.warnings.push({
            detail: "Some products went out of stock",
            products: items
        });

        await Promise.all([
            this.click('#continue_button'),
            this.page.waitForNavigation({ timeout: this.timeout, waitUntil: "domcontentloaded" })
        ]);
    }

    async _navigateProcessing() {
        await this.page.waitForNavigation({ timeout: 0, waitUntil: "domcontentloaded" });
    }
}

module.exports = Store;
