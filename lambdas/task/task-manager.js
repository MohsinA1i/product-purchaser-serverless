class TaskManager {
    async execute(store, tasks, connection) {
        tasks = this.optimizeTasks(tasks);
        try {
            for (const task of tasks) {
                if (this.aborted) throw new Error('Aborted');
                if (task.type === 'add') {
                    connection.send('info', { detail: 'Adding to cart' });
                    const results = await Promise.allSettled(task.products.map((product) =>
                        store.addToCart(product.path, product.size, product.quantity)
                    ));
                    results.forEach((result) => {
                        if (result.status === 'rejected') {
                            connection.send('warning', {
                                task: task.type,
                                detail: 'Failed to add product to cart',
                                reason: result.reason
                            });
                        }
                    });
                } else {
                    if (task.type === 'login') {
                        connection.send('info', { task: task.type, detail: 'Logging in' });
                        await store.login(task.account);
                    } else if (task.type === 'logout') {
                        connection.send('info', { task: task.type, detail: 'Logging out' });
                        await store.logout();
                    } else if (task.type === 'empty') {
                        connection.send('info', { task: task.type, detail: 'Emptying cart' });
                        await store.emptyCart();
                    } else if (task.type === 'contact') {
                        connection.send('info', { task: task.type, detail: 'Setting contact information' });
                        const warnings = await store.setContact(task.contact);
                        if (warnings)
                            for (const warning of warnings)
                                connection.send('warning', { task: task.type, detail: warning });
                    } else if (task.type === 'coupon') {
                        connection.send('info', { task: task.type, detail: 'Applying coupon' });
                        await store.setCoupon(task.coupon);
                    } else if (task.type === 'shipping') {
                        connection.send('info', { task: task.type, detail: 'Setting shipping information' });
                        const warnings = await store.setShipping();
                        if (warnings)
                            for (const warning of warnings)
                                connection.send('warning', { task: task.type, detail: warning });
                    } else if (task.type === 'payment') {
                        connection.send('info', { task: task.type, detail: 'Submitting payment' });
                        const warnings = await store.submitPayment(task.card, task.billing);
                        if (warnings)
                            for (const warning of warnings)
                                connection.send('warning', { task: task.type, detail: warning });
                        connection.send('info', { task: task.type, detail: 'Payment successful' });
                    }
                }
            }
        } catch (error) {
            return error;
        }
    }

    async abort() {
        this.aborted = true;
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
}

module.exports = TaskManager;