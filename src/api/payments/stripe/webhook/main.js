import Stripe from 'npm:stripe';

const stripeWebhook = (payload) => {

    const { config, env, headers, models } = stripeWebhook;

    const stripe = new Stripe(config.apiKey);

    const sig = headers['stripe-signature'];

    let event;

    try {
        event = stripe.webhooks.constructEvent(payload, sig, env.STRIPE_WEBHOOK_SECRET);

    } catch (err) {
        console.log(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;

            // get id from metadata
            const subscriptionId = session.metadata.subscriptionId;

            models.subscriptions.update({ _id: subscriptionId }, {
                subscriptionId,
                status: session.status
            })


            // Save subscription ID to your database here
            console.log(`Subscription successful with ID: ${subscriptionId}`);
            break;
        }

        default: {
            console.log(`Unhandled event type ${event.type}`);
        }
    }
}

export default stripeWebhook;