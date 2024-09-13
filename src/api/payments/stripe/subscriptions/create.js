// create a function for stripe subscription integration for US$ 20.00 /month
import Stripe from 'npm:stripe';

const createSubscription = async ({ priceId, user, successRedirectUrl, cancelRedirectUrl }) => {

    const { config, models } = createSubscription;

    const subscriptionDoc = await models.subscriptions.create({
        userId: user._id,
        copilotzId: user.copilotzId,
        paymentProvider: 'stripe',
    });

    const stripe = new Stripe(config.apiKey);

    try {
        let customer;

        // Search for existing customer by email
        const customers = await stripe.customers.list({
            limit: 1,
            // Search by metadata field (phone number)
            query: `metadata['phone']:'${user.phone}'`,
        });

        if (customers.data.length > 0) {
            // If customer exists, use the first one found
            customer = customers.data[0];
        } else {
            // Create a new customer if none exists
            customer = await stripe.customers.create({
                phone: user.phone,
                email: user.email,
                name: user.name,
                metadata: {
                    phone: user.phone, // Store the phone in metadata
                },
            });
        }
        // Create a new Checkout Session using the Stripe
        const session = await stripe.checkout.sessions.create({
            customer: customer.id,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId, //Use the priceId from the price created in the Stripe Dashboard
                    quantity: 1,
                },
            ],
            mode: 'payment',
            metadata: {
                subscriptionId: subscriptionDoc._id,
            },
            success_url: successRedirectUrl,
            cancel_url: cancelRedirectUrl,
        })
        return {
            sessionId: session.id,
            sessionUrl: session.url,
            subscriptionId: subscriptionDoc._id,
        }
    } catch (error) {
        console.error(error);
    }
}

export default createSubscription
