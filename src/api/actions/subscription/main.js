import pluralize from 'npm:pluralize';

export default ({ adapters, config, resources }) => {

    const { user, subscription, tenant } = resources;

    const { models, payment } = adapters
    const methods = {
        getCopilotz: () => {
            return {
                availableCopilotz: [{
                    name: 'meanota',
                    description: 'Meanota is a copilotz that helps you with transcribing your audio messages into text.',
                }],
            }
        },
        getPlans: ({ copilot }) => {
            // if(!copilot) return { message: 'To check the available plans, user must select an available copilotz first by mentioning it. (ex.: @copilotz_name).' }
            if (!subscription) return { message: 'Other plans unavailable at this moment.' }
            return subscription;
        },
        startTrial: ({ copilot }) => {

            const planName = 'trial';

            copilot = copilot.replace('@', '');
            if (copilot !== 'meanota') return { message: `Copilot ${copilot} is not available for trial. Check other available copilots, or suggest a plan upgrade.` }
            if (user.context.subscriptions?.[copilot]?.plan === planName) {
                return { message: `User already has a trial subscription for copilot @${copilot}. Check other available plans, or suggest a plan upgrade.` }
            }
            user.context = {
                ...user.context,
                subscriptions: {
                    ...user.context.subscriptions,
                    [copilot]: {
                        id: crypto.randomUUID(),
                        plan: planName,
                        status: 'active',
                        period: `${new Date().toISOString()}_${new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 30).toISOString()}`,
                        consumption: 0,
                    }
                }
            }
            models.user.update({ _id: user._id }, user, { updateByPath: false })
            const instructions=`Trial subscription for copilot @${copilot} started successfully. I'll translate (if necessary) the following message and pass it to the user:
\`\`\`
All set!

To get started, simply send \`@${copilot}\` in this conversation.

After that, you will receive an automatic message responding with \`@${copilot}\`, confirming that everything is set up!

You can record an audio message directly here, or forward an audio message to our conversation, and I will transcribe it into text for you.

During your trial period, you have ${subscription?.[planName]?.limit} ${subscription?.[planName]?.limit > 1 ? pluralize(subscription?.[planName]?.unit) : subscription?.[planName]?.unit} units available for transcription!
After that, you will need to upgrade your plan to continue using the service.

If you need any help down the road, just type \`@copilotz\` in your message to talk to me again.
\`\`\`
`;
            return { message: instructions }

        },
        subscribe: async ({ copilot, planId }) => {

            copilot = copilot.replace('@', '');
            if (copilot !== 'meanota') return { message: `Copilot ${copilot} is not available for trial. Check other available copilots, or suggest a plan upgrade.` }
            return { message: `PlanId ${planId} is not yet available. Thank the user for the interest, and say well'll be in touch shortly. In the meanwhile, we're offering bigger limits for the trial plan.` }
        },
        // subscribe: async ({ copilot, planId }) => {

        //     let customer = await paymentManager.customer.search({ query: [{ phone: user.phone }, { email: user.email }], expand: ['subscriptions.items.price'] });
        //     // create customer if not found
        //     if (!customer.length) {
        //         customer = await paymentManager.customer.create({ user, metadata: { tenant: tenant?.toString() } });
        //     } // else if more than one customer found, use the first one
        //     else {
        //         customer = customer.filter(c => c?.metadata?.tenant === tenant?.toString())[0];
        //     }
        //     // update user context
        //     const customerId = customer.id;

        //     // check for product subscriptions in user context
        //     const subscriptions = customer.subscriptions?.items?.filter(i => i.metadata.copilot === copilot);
        //     const activeSubscriptions = subscriptions.some(s => s.status === 'active');
        //     if (!activeSubscriptions) {
        //         // check product for copilot
        //         const product = await paymentManager.product.search({ query: { 'metadata["copilot"]': copilot } });
        //         if (!product.length) {
        //             throw new Error(`Product for copilot ${copilot} not found`);
        //         }
        //         const subscriptionPlan = await paymentManager.subscription.create({
        //             customer: customerId,
        //             items: [{ price: product.defaultPrice }]
        //         });
        //         user.context = {
        //             ...user.context,
        //             subscriptions: {
        //                 ...user.context.subscriptions,
        //                 [copilot]: {
        //                     plan: product.metadata.plan,
        //                     status: subscriptionPlan.status,
        //                     url: subscriptionPlan.url,
        //                     period: `${subscriptionPlan.current_period_start}_${subscriptionPlan.current_period_end}`,
        //                     consumption: 0,
        //                     limit: 1000,
        //                     unit: 'any',
        //                 }
        //             }
        //         }
        //         await userManager.updateUser(user);
        //     } else {
        //         throw new Error(`Subscription for copilot ${copilot} already exists`);
        //     }

        //     return { message: `Checkout session created successfully. Redirect user to ${user.context.subscriptions[copilot].url}. Once the payment is completed, user will be subscribed to copilot and have access to its capabilities.` }
        // }

    }
    const specs = {
        getCopilotz: '(Fetches available copilotz): void -> object containing available copilotz',
        getPlans: '(Fetches available subscription plans): void -> object containing available subscription plans',
        startTrial: '(Starts a trial subscription): copilot<string>(copilot id) -> success or error message',
        subscribe: '(Subscribes user to copilot): !copilot<string>(copilot id),!planId<string>(plan id, can either be `basic` or  `pro`) -> success or error message',
    }

    for (const [key, value] of Object.entries(methods)) {
        value.spec = specs[key]
    }

    return methods;
}