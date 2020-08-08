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
        const response = { tasks: [] };
        for (const task of this.tasks) {
            const result = await this._execute(task);
            if (Array.isArray(result)) {
                response = [...response, ...result];
            } else {
                response.push(result);
                if (this._blockingTask(task) && result.error) {
                    response.error = result.error;
                    break;
                }
            }
        }
    }

    async _execute(task) {
        if (task.type === 'add') {
            const results = await Promise.allSettled(task.products.map((product) => 
                this.store.addToCart(product.path, product.size, product.quantity)
            ));
            return results.map((result) => {
                const _result = { type: task.type };
                if (result.status === 'rejected'){
                    _result.error = result.reason;
                } else {
                    _result.detail = "Added product";
                    _result.product = result.value;
                }
                return _result;
            });
        } else {
            const result = { type: task.type };
            try {
                if (task.type === 'login') {
                    await this.store.login(task.account);
                    result.detail = "Logged in";
                } else if (task.type === 'logout') { 
                    await this.store.logout();
                    result.detail = "Logged out";
                } else if (task.type === 'cart') {
                    result.cart = await this.store.getCart();
                    result.detail = "Cart";
                } else if (task.type === 'empty') {
                    await this.store.emptyCart();
                    result.detail = "Emptied cart"
                } else if (task.type === 'contact') {
                    await this.store.setContact(task.contact);
                    result.detail = "Contact set";
                } else if (task.type === 'coupon') {
                    await this.store.setCoupon(task.coupon);
                    result.detail = "Coupon applied";
                } else if (task.type === 'shipping') {
                    await this.store.setShipping();
                    result.detail = "Shipping set";
                } else if (task.type === 'payment') { 
                    await this.store.submitPayment(task.card, task.billing);
                    result.detail = "Payment successful";
                }
            } catch (error) { result.error = error; }
            return result
        }
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