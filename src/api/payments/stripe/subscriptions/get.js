const getSubscription = async ({ subscriptionId }) => {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription
}

export default getSubscription;
