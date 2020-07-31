const UrlEncode = require('urlencode');
const Chromium = require('chrome-aws-lambda');
const { addExtra } = require('puppeteer-extra');
const Puppeteer = addExtra(Chromium.puppeteer);
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
Puppeteer.use(StealthPlugin());

const StateManager = require('./state-manager.js'); 

class Site {
    constructor(hostname, options) {
        this.hostname = hostname;
        this.options = options;
        this.timeout = 10000;
    }

    async open() {
        this.state = new StateManager(this.options.userId);
        if (this.options.session) {
            await this.state.load(this.options.session);
        } else {
            await this.state.create(this.hostname, this.options.proxy);
        }

        if (this.options.captcha) {
            Puppeteer.use(RecaptchaPlugin({ provider: { id: '2captcha', token: this.options.captcha } }));
        }

        const args = [
            ...Chromium.args,
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ];
        if (this.state.proxy) 
            args.push(`--proxy-server=http://${this.state.proxy.address}:${this.state.proxy.port}`);
        if (this.options.headless && this.options.captcha === undefined) this.options.headless = false;
        this.browser = await Puppeteer.launch({
            headless: this.options.headless, 
            slowMo: 10, 
            args: args,
            defaultViewport: this.state.fingerprint.viewport,
            executablePath: await Chromium.executablePath,
        });
        
        this.page = await this.browser.newPage();

        if (this.state.proxy) 
            await this.page.authenticate({ username: this.state.proxy.username, password: this.state.proxy.password });
        
        await this.page.setUserAgent(this.state.fingerprint.useragent);

        let cookies = [];
        if (this.state.fingerprint.cookies)
            cookies = [ ...cookies, ...this.state.fingerprint.cookies ];
        if (this.state.session.cookies)
            cookies = [ ...cookies, ...this.state.session.cookies ];
        await this.page.setCookie(...cookies);

        await this.page.setRequestInterception(true);
        this.override = {};
        this.page.on('request', (req) => {
            const url = req.url();
            const type = req.resourceType();
            const method = req.method();

            if (url.startsWith(`https://${this.hostname}`) && req.isNavigationRequest()) { console.log(req.url()); }

            if (method === 'POST' && type === 'document' && url.startsWith(`https://${this.hostname}`)) {
                const path = url.match(/(?:https?:\/\/)?(?:[^\/]+)([^?]+)/)[1];
                if (path === '/account/login') {
                    let postData = req.postData();
                    postData = postData.replace('email%5D=&', `email%5D=${UrlEncode(this.override.email)}&`);
                    postData = postData.replace('password%5D=&', `password%5D=${UrlEncode(this.override.password)}&`);
                    req.continue({ postData: postData });
                    return;
                } else if (path !== '/') {
                    const segments = path.match(/(?<=\/)([^\/?])+/g);
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

            if (type === 'document' || type === 'script' || type === 'xhr' || type === 'fetch' || type === 'stylesheet' && !this.headless) {
                req.continue();
                return;
            }

            if (this.options.captcha === undefined) {
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
    }

    async dispose() {
        delete this.state.session;
    }

    async close() {
        const services = [
            'https://google.com',
            'https://assets.hcaptcha.com',
            'https://shopify.com'
        ];
        if (this.state.session) {
            this.state.session.cookies = await this.page.cookies(`https://${this.hostname}`);
            this.state.fingerprint.cookies = await this.page.cookies(...services);
        } else {
            this.state.fingerprint.cookies = await this.page.cookies(`https://${this.hostname}`, ...services);
        }       
        await this.page.close();
        await this.browser.close();
        await this.state.save();
        return this.state.sessionId;
    }

    async goto(path) {
        try {
            await this.page.goto(`https://${this.hostname}${path}`, { timeout: this.timeout, waitUntil: "domcontentloaded" });
        } catch (error) { await this.reload(); }
    }

    async reload() {
        try {
            await this.page.reload({ timeout: this.timeout, waitUntil: "domcontentloaded" });
        } catch (error) { await this.reload(); }
    }

    async where() {
        try {
            const url = this.page.url();
            if (url === 'about:blank') {
                return;
            } else {
                const heading = await this.page.evaluate(() => {
                    const heading = document.querySelector('.cf-subheadline');
                    if (heading) return heading.textContent;
                });
                if (heading) {
                    if (heading.startsWith('Please')) return 'cloudflare';
                    else if (heading.endsWith('limited')) return 'limited';
                } else {
                    const path = url.match(/(?:https?:\/\/)?(?:[^\/]+)([^?]+)/)[1];
                    if (path === '/') { 
                        return 'home'
                    } else {
                        const segments = path.match(/(?<=\/)([^\/?])+/g);
                        if (segments.includes('checkouts')) {
                            return await this.page.evaluate(() => meta.page.path.match(/([^\/\?]*)(?:\?[^?]*)?$/)[0]);
                        } else {
                            return path.match(/([^\/\?]*)(?:\?[^?]*)?$/)[1];
                        }
                    }
                }
            }
        } catch (error) {
            await this.reload();
            return await this.where();
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

        await this.page.waitForSelector('[name="g-recaptcha-response"]');

        if (this.options.captcha) {
            let findError, solutionError, solveError, otherError;
            try {
                let response = await this.page.findRecaptchas();
                findError = response.error;
                response = await this.page.getRecaptchaSolutions(response.captchas);
                solutionError = response.error;
                response = await this.page.enterRecaptchaSolutions(response.solutions);
                solveError = response.error;
            } catch (error) { otherError = error; }
            if (findError || solutionError || solveError || otherError) {
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
}

module.exports = Site;