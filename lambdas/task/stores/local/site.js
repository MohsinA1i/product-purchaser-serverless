const UrlEncode = require('urlencode');
const Chromium = require('chrome-aws-lambda');
const { addExtra } = require('puppeteer-extra');
const Puppeteer = addExtra(Chromium.puppeteer);
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
Puppeteer.use(StealthPlugin());

const Regex = require('../regex');
const StateManager = require('../state-manager');

class Site {
    constructor(hostname) {
        this.hostname = hostname;
        this.state = Site.state.CLOSED;
        this.timeout = 15000;
    }

    static status = {
        SUCCESS: 1,
        CAPTCHA: 4,
        KEYWORDS: 5,
        STOCK: 6,
        LOGIN: 7,
        QUEUE: 8,
        COUPON: 9,
        CONTACT: 10,
        SHIPPING: 11,
        PAYMENT: 12,
        WAITING: 13,
        NAVIGATED: 14
    }

    static state = {
        CLOSED: 0,
        OPEN: 1
    }

    async open(options) {
        if (options.retryDelay === undefined) options.retryDelay = 1000;
        this.options = options;

        this.stateManager = new StateManager(this.options.userId);
        if (this.options.session) 
            await this.stateManager.load(this.options.session);
        else
            await this.stateManager.create(this.hostname, this.options.proxy);

        if (this.options.captcha)
            Puppeteer.use(RecaptchaPlugin({ provider: { id: '2captcha', token: this.options.captcha } }));

        const args = [
            ...Chromium.args,
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ];
        if (this.stateManager.proxy) 
            args.push(`--proxy-server=http://${this.stateManager.proxy.address}:${this.stateManager.proxy.port}`);
        
        if (this.options.headless === undefined) this.options.headless = true;
        this.browser = await Puppeteer.launch({
            executablePath: await Chromium.executablePath,
            headless: this.options.headless, 
            slowMo: 10, 
            args: args,
            defaultViewport: this.stateManager.fingerprint.viewport
        });
        
        this.page = await this.browser.newPage();

        if (this.stateManager.proxy && this.stateManager.proxy.username) 
            await this.page.authenticate({ username: this.stateManager.proxy.username, password: this.stateManager.proxy.password });
        
        await this.page.setUserAgent(this.stateManager.fingerprint.useragent);

        let cookies = [];
        if (this.stateManager.fingerprint.cookies)
            cookies = [ ...cookies, ...this.stateManager.fingerprint.cookies ];
        if (this.stateManager.session.cookies)
            cookies = [ ...cookies, ...this.stateManager.session.cookies ];
        await this.page.setCookie(...cookies);

        await this.page.setRequestInterception(true);
        this.override = {};
        this.page.on('request', (req) => {
            const url = req.url();
            const type = req.resourceType();
            const method = req.method();

            if (method === 'POST' && type === 'document' && url.startsWith(`https://${this.hostname}`)) {
                const path = Regex.getPath(url);
                if (path === '/account/login') {
                    let postData = req.postData();
                    postData = postData.replace('email%5D=&', `email%5D=${UrlEncode(this.override.email)}&`);
                    postData = postData.replace('password%5D=&', `password%5D=${UrlEncode(this.override.password)}&`);
                    req.continue({ postData: postData });
                    return;
                } else if (path !== '/') {
                    const segments = Regex.getSegments(path);
                    if (segments.includes('checkouts')) {
                        let postData = req.postData();
                        const step = postData.match(/(?:_step=)([^&]+)/);
                        if (step && step[1] === 'contact_information') {
                            postData = postData.replace('email_or_phone%5D=&', `email_or_phone%5D=${UrlEncode(this.override.email)}&`);
                            postData = postData.replace('email%5D=&', `email%5D=${UrlEncode(this.override.email)}&`);
                            req.continue({ postData: postData });
                            return;
                        }
                    }
                }
            }

            if (type === 'document' || type === 'script' || type === 'xhr' || type === 'fetch' || type === 'stylesheet' && !this.options.headless) {
                req.continue();
                return;
            }

            if (!this.options.captcha) {
                if (type === 'image') {
                    if (url.startsWith('https://www.google.com/recaptcha') ||
                        url.startsWith('https://assets.hcaptcha.com/captcha') ||
                        url.startsWith('https://imgs.hcaptcha.com')) {
                            req.continue();
                            return;
                        }
                } else if (type === 'stylesheet') {
                    if (url.startsWith('https://www.gstatic.com/recaptcha') ||
                    url.startsWith('https://assets.hcaptcha.com/captcha')) {
                        req.continue();
                        return;
                    }
                }
            }
            
            req.abort();
        });

        if (this.delayedClose) await this.delayedClose();
        else this.state = Site.state.OPEN;
    }

    async close(save) {
        if (this.state === Site.state.CLOSED)
            this.delayedClose = async () => { await this._close(save); }
        else {
            this.state = Site.state.CLOSED
            return await this._close(save);
        }
    }

    async _close(save) {
        if (this.page && !this.page.isClosed()) {
            if (save === StateManager.save.DISPOSE_SESSION && this.dispose) this.dispose();
            this.stateManager.session.cookies = await this.page.cookies(`https://${this.hostname}`);
            const services = ['https://google.com', 'https://assets.hcaptcha.com', 'https://shopify.com'];
            this.stateManager.fingerprint.cookies = await this.page.cookies(...services);
        }
        await this.stateManager.save(save);

        await this.browser.close();

        return this.stateManager.sessionId;
    }

    async waitForClose() {
        await new Promise(resolve => {
            this.page.on('close', () => { resolve() });
            this.browser.on('disconnected', () => { resolve() });
        });
    }

    async goto(path) {
        await this.page.goto(`https://${this.hostname}${path}`, { timeout: this.timeout, waitUntil: "domcontentloaded" });
    }

    async waitForNavigation() {
        this.setStatus(Site.status.WAITING);
        await this.page.waitForNavigation({ timeout: 0, waitUntil: "domcontentloaded" });
        this.setStatus(Site.status.NAVIGATED);
    }

    async reload() {
        await this.page.reload({ timeout: this.timeout, waitUntil: "domcontentloaded" });
    }

    async where() {
        const url = this.page.url();
        if (url === 'about:blank') {
            return;
        } else {
            try {
                const heading = await this.page.evaluate(() => {
                    const heading = document.querySelector('.cf-subheadline');
                    if (heading) return heading.textContent;
                });
                if (heading) {
                    if (heading.startsWith('Please')) return 'cloudflare';
                    else if (heading.endsWith('limited')) return 'limited';
                } else {
                    const path = Regex.getPath(url);
                    if (path === '/') { 
                        return 'home'
                    } else {
                        const segments = Regex.getSegments(path);
                        if (segments.includes('checkouts')) {
                            return await this.page.evaluate(() => Shopify.Checkout.step);
                        } else {
                            return Regex.getEndpoint(path);
                        }
                    }
                }
            } catch (error) {
                if (error.message.startsWith('Execution context was destroyed')) {
                    await this.page.waitForNavigation({ timeout: 0, waitUntil: "domcontentloaded" });
                    return await this.where();
                } else throw error;
            }
        }
    }

    async click(selector) {
        await this.page.$eval(selector, element => element.click());
    }

    async navigateCloudflare() {
        await Promise.all([
            this.waitForHCaptcha(true),
            this.page.waitForNavigation({ timeout: 0, waitUntil: "domcontentloaded" })
        ]);
    }

    async waitForReCaptcha(bound = false) {
        const reCaptcha = await this.page.evaluate(() => {
            const selectors = ['.g-recaptcha'];
            for (const selector of selectors) {
                if (document.querySelector(selector) !== null) return selector;
            }
        });
        if (reCaptcha === undefined) return;

        this.setStatus(Site.status.CAPTCHA);
        await this.page.waitForSelector('[name="g-recaptcha-response"]');

        if (this.options.captcha) {
            let response = await this.page.findRecaptchas();
            const findError = response.error;
            response = await this.page.getRecaptchaSolutions(response.captchas);
            const solutionError = response.error;
            response = await this.page.enterRecaptchaSolutions(response.solutions);
            const solveError = response.error;
            if (findError || solutionError || solveError) {
                await this.reload();
                await this.waitForReCaptcha();
            }
        } else if (!this.options.headless) {
            await this.page.$eval('.g-recaptcha', element => {
                element.scrollIntoView({behavior: "smooth", block: "center"});
            });

            if (!bound) {
                await this.page.waitForFunction(() => document.querySelector('[name="g-recaptcha-response"]').value.length > 0,
                    { timeout: 0, polling: 'mutation' });
            }
        } else throw new Error('Encountered captcha');
    }

    async waitForHCaptcha(bound = false) {
        const hCaptcha = await this.page.evaluate(() => {
            const selectors = ['.h-captcha', '.cf-captcha-container'];
            for (const selector of selectors) {
                if (document.querySelector(selector) !== null) return selector;
            }
        });
        if (hCaptcha === undefined) return;

        await this.page.waitForSelector('[name="h-captcha-response"]');

        if (!this.options.headless) {
            await this.page.$eval(hCaptcha, element => {
                element.scrollIntoView({behavior: "smooth", block: "center"});
            });
    
            if (!bound) {
                await this.page.waitForFunction(() => document.querySelector('[name="h-captcha-response"]').value.length > 0,
                    { timeout: 0, polling: 'mutation' });
            }
        } else throw new Error('Encountered captcha');
    }

    setStatus(status) {}
}

module.exports = Site;