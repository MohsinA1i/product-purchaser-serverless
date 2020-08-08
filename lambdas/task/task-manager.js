class TaskManager {
    constructor(store, tasks) {
        this.store = store;
        this.tasks = this._optimizeTasks(tasks);
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

    async execute() {
        let error, warnings = [];

        for (const task of this.tasks) {
            try {
                const _warnings = await this._execute(task);
                warnings = [...warnings, ..._warnings];
            } catch (_error) {
                error = _error.message;
                break;
            }
        }

        return {
            warnings: warnings,
            error: error
        }
    }

    async _execute(task) {
        const warnings = [];
        if (task.type === 'add') {
            const results = await Promise.allSettled(task.products.map((product) => 
                this.store.addToCart(product.path, product.size, product.quantity)
            ));
            results.forEach((result) => {
                if (result.status === 'rejected') {
                    warnings.push({
                        detail: 'Failed to add product to cart',
                        reason: result.reason
                    });
                }
            });
        } else {
            if (task.type === 'login') {
                await this.store.login(task.account);
            } else if (task.type === 'logout') { 
                await this.store.logout();
            } else if (task.type === 'empty') {
                await this.store.emptyCart();
            } else if (task.type === 'contact') {
                const result = await this.store.setContact(task.contact);
                if (result) warnings.push(result);
            } else if (task.type === 'coupon') {
                await this.store.setCoupon(task.coupon);
            } else if (task.type === 'shipping') {
                const result = await this.store.setShipping();
                if (result) warnings.push(result);
            } else if (task.type === 'payment') { 
                const result = await this.store.submitPayment(task.card, task.billing);
                if (result) warnings.push(result);
            }
        }
        return warnings;
    }

    _blockingTask(task) {
        if (task.type === 'login' ||
            result.type === 'logout' ||
            result.type === 'empty' ||
            result.type === 'contact' ||
            result.type === 'coupon' ||
            result.type === 'shipping' ||
            result.type === 'payment' ) {
                return true;
        } else return false;
    }
}

module.exports = TaskManager;