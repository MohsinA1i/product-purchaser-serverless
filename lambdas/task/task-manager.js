class TaskManager {
    constructor(store, tasks, response) {
        this.store = store;
        this.tasks = this._optimizeTasks(tasks);
        this.response = response;
    }

    _optimizeTasks(tasks) {
        const _tasks = [];
        let products = [];
        let start;
        for (let index = 0; index < tasks.length; index++) {
            const task = tasks[index];
            if (task.type === 'add') {
                if (start === undefined) start = index;
                products.push(task.product);
            } else {
                if (start >= 0) {
                    _tasks.push({ type: 'add', products: products });
                    products = [];
                    start = undefined;
                }
                _tasks.push(task);
            }
        }
        if (start) _tasks.push({ type: 'add', products: products });
        return _tasks;
    }

    async execute(task) {
        for (const task of this.tasks) {
            try {
                if (task.type === 'add') {
                    const results = await Promise.allSettled(task.products.map((product) => 
                        this.store.addToCart(product.path, product.size, product.quantity)
                    ));
                    results.forEach((result) => {
                        if (result.status === 'rejected') {
                            this.response.send('warning', {
                                detail: 'Failed to add product to cart',
                                reason: result.reason
                            });
                        }
                    });
                } else {
                    if (task.type === 'login') {
                        this.response.send('info', { detail: 'Logging in' });
                        await this.store.login(task.account);
                    } else if (task.type === 'logout') { 
                        this.response.send('info', { detail: 'Logging out' });
                        await this.store.logout();
                    } else if (task.type === 'empty') {
                        this.response.send('info', { detail: 'Emptying cart' });
                        await this.store.emptyCart();
                    } else if (task.type === 'contact') {
                        this.response.send('info', { detail: 'Setting contact information' });
                        const warnings = await this.store.setContact(task.contact);
                        if (warnings)
                            for (const warning of warnings)
                                this.response.send('warning', warning);
                    } else if (task.type === 'coupon') {
                        this.response.send('info', { detail: 'Applying Coupon' });
                        await this.store.setCoupon(task.coupon);
                    } else if (task.type === 'shipping') {
                        this.response.send('info', { detail: 'Setting shipping information' });
                        const warnings = await this.store.setShipping();
                        if (warnings)
                            for (const warning of warnings)
                                this.response.send('warning', warning);
                    } else if (task.type === 'payment') { 
                        this.response.send('info', { detail: 'Submitting Payment' });
                        const warnings = await this.store.submitPayment(task.card, task.billing);
                        if (warnings)
                            for (const warning of warnings)
                                this.response.send('warning', warning);
                    }
                }
            } catch (error) { 
                this.response.send('error', { detail: error.message });
                break;
            }
        }
    }
}

module.exports = TaskManager;