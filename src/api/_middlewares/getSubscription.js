const getSubscription = async (req) => {

    const { models, payments } = getSubscription;

    const { resources } = getSubscription;

    const { user, copilotz } = resources;

    const subscriptionDoc = await models.subscriptions.findOne(
        { user: user?._id, copilotz: copilotz?._id }
    );

    if (!subscriptionDoc || !payments[subscriptionDoc?.paymentProvider]) return;

    const subscriptionData = await payments[subscriptionDoc.paymentProvider].subscriptions.get(
        { subscriptionId: subscriptionDoc.subscriptionId }
    );

    getSubscription.resources.subscription = subscriptionData;

    return req;
}

export default getSubscription;