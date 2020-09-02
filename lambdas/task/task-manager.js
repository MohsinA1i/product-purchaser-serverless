class TaskManager {
    async execute(store, tasks) {
        for (const task of tasks) {
            if (task.type === 'login') {
                await store.login(task.account);
            } else if (task.type === 'logout') {
                await store.logout();
            } else if (task.type === 'empty') {
                await store.emptyCart();
            } else if (task.type === 'add') {
                const product = task.product;
                store.addToCart(product.path, product.size, product.quantity, task.retry);
            } else if (task.type === 'contact') {
                await store.setContact(task.contact);
            } else if (task.type === 'coupon') {
                await store.setCoupon(task.coupon);
            } else if (task.type === 'shipping') {
                await store.setShipping();
            } else if (task.type === 'payment') {
                await store.submitPayment(task.card, task.billing);
            }
        }
    }
}

module.exports = TaskManager;