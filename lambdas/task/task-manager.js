class TaskManager {
    constructor(store) {
        this.store = store;
    }

    optimizeTasks(tasks) {
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
        if (task.type === 'add') {
            const results = await Promise.allSettled(task.products.map((product) => 
                this.store.addToCart(product.path, product.size, product.quantity)
            ));
            return results.map((result) => {
                const response = { type: task.type };
                if (result.status === 'rejected'){
                    response.error = result.reason;
                } else {
                    response.detail = "Added product";
                    response.product = result.value;
                }
                return response;
            });
        } else {
            const response = { type: task.type };
            try {
                if (task.type === 'contact') {
                    await this.store.setContact(task.contact);
                    response.detail = "Contact set";
                } else if (task.type === 'shipping') {
                    await this.store.setShipping();
                    response.detail = "Shipping set";
                } else if (task.type === 'payment') { 
                    await this.store.submitPayment(task.card, task.billing);
                    response.detail = "Payment successful";
                } else if (task.type === 'coupon') {
                    await this.store.setCoupon(task.coupon);
                    response.detail = "Coupon applied";
                } else if (task.type === 'login') {
                    await this.store.login(task.account);
                    response.detail = "Logged in";
                } else if (task.type === 'logout') { 
                    await this.store.logout();
                    response.detail = "Logged out";
                } else if (task.type === 'cart') {
                    response.cart = await this.store.getCart();
                    response.detail = "Cart";
                }
            } catch (error) { 
                response.error = error.message;
            } 
            return response
        }
    }
}

module.exports = TaskManager;