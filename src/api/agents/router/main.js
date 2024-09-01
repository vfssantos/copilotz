export default ({ config, adapters, resources }) => {
    const { dataProcessing, dynamicImport, models } = adapters;
    const { tenant } = resources;

    function createPrompt(template, data) {
        return template.replace(/\{\{(\w+)\}\}/g, function (_, key) {
            return data[key] || '';
        });
    }

    const tempalte404 = `
## COPILOTZ ROUTING INSTRUCTIONS
The requested copilotz {{copilotName}} is not available. Please, try again with another copilotz name.

Guidelines:
- Copilotz are identified by @mentions.
- Guide the user to try again with another copilotz name.
================
`;

    const routingTemplate = `
## COPILOTZ ROUTING INSTRUCTIONS
This copilotz is subject to subscription. Here's the current user subscription status, and instructions on how to proceed:
STATUS: {{userSubscription}}
INSTRUCTIONS: {{workflowClassificationInstructions}}

Guidelines:
- Copilotz are identified by @mentions.
- Usage limits are enforced based on the subscription plan.
- Guide the user to upgrade or reactivate the subscription if necessary.
================
`;

    return async ({ user: userData, thread, content, instructions, input, __executionId__, self, ...rest }, res) => {

        // Initiate Instructions
        instructions = instructions || '';
        // Extract mentions
        let mentions;
        if (content.text) {
            mentions = (await mentionsExtractor({ input: content.text }))
                ?.filter(Boolean)
                ?.map(i => i.replace('@', ''));
        }

        // 0. Get user document
        const userDoc = await models.user.findOne({ phone: userData.phone, tenant });

        // 1. Get agent name
        const copilotName = mentions?.[0] || userDoc?.context?.currentCopilot || config.copilot || 'copilotz';
        let newCopilotName = copilotName;
        let workflowClassificationInstructions;
        let subscriptionStatus;
        let userSubscription;
        let error;

        let agent = await dynamicImport({ config: { name: copilotName } }, { requestId: __executionId__ })
            .then(r => r).catch(e => {
                error = e.message;
                newCopilotName = config.copilot;
                workflowClassificationInstructions = createPrompt(tempalte404, { copilotName });
                instructions = workflowClassificationInstructions + instructions
                return
            })


        const { metadata } = agent || {};
        if (!metadata) newCopilotName = config.copilot;
        // Get subscription status
        if (metadata?.config?.isPayed) {
            userSubscription = userDoc?.context?.subscriptions?.[copilotName];
            // Check if subscription exists
            if (!userSubscription) {
                newCopilotName = config.copilot;
                workflowClassificationInstructions = 'Subscription not found. Start Trial';
            }
            // Check if the subscription is active
            else if (!(userSubscription.status === 'active')) {
                newCopilotName = config.copilot;
                workflowClassificationInstructions = 'Subscription not active. Reactivate subscription';
            }
            // Check if current usage is within the limits
            else if (
                (metadata?.config?.subscriptionPlans?.[userSubscription?.plan].limit && (userSubscription?.[metadata?.config?.subscriptionPlans?.[userSubscription?.plan]?.limitType] >= metadata?.config?.subscriptionPlans?.[userSubscription?.plan].limit))
            ) {
                newCopilotName = config.copilot;
                workflowClassificationInstructions = userSubscription.plan === 'trial'
                    ? 'Trial usage limit exceeded. Upgrade to a paid plan.'
                    : 'Usage limit exceeded. Upgrade subscription'
                subscriptionStatus = 'over_limit';
            }
        }
        if ((newCopilotName !== copilotName)) {
            agent = await dynamicImport(
                { config: { name: newCopilotName } },
                { resources: { subscription: metadata?.config?.subscriptionPlans, }, requestId: __executionId__ }
            ).then(r => r).catch(e => {
                error = e.message;
                instructions = `Copilotz ${newCopilotName} not found. Please, try again with another copilotz name.` + instructions
                return agent
            })
        }

        workflowClassificationInstructions && !error && (instructions = (createPrompt(routingTemplate, { userSubscription: JSON.stringify(userSubscription), workflowClassificationInstructions }) + instructions));
        if (
            (newCopilotName !== userDoc?.context?.currentCopilot) ||
            !userDoc?.context?.currentCopilot
        ) {
            const _copilotName = newCopilotName || copilotName;
            let subscriptions = {};
            if (subscriptionStatus) {
                subscriptions = { subscriptions: { [copilotName]: { status: subscriptionStatus } } }
            }
            models.user.update({ phone: userData.phone, tenant }, { context: { currentCopilot: _copilotName, ...subscriptions } });
        }

        const agentAnswer = await agent({
            ...rest,
            instructions,
            user: { ...userDoc, ...userData, context: { ...userDoc?.context, ...userData?.context } },
            workflowClassificationInstructions: workflowClassificationInstructions ? ('## Important Instructions: ' + workflowClassificationInstructions) : '',
            thread,
            content,
            __executionId__,
            self
        }, res);
        // Update Consumption
        if (
            metadata?.config?.isPayed &&
            (agent.metadata.config.name !== config.copilot) &&
            agentAnswer?.consumption?.value
        ) {
            models.user.update(
                { phone: userData.phone, tenant },
                {
                    context: {
                        subscriptions: {
                            [copilotName]: {
                                consumption: (userDoc?.context?.subscriptions?.[copilotName]?.consumption || 0) + (agentAnswer?.consumption?.value || 0),
                                count: (userDoc?.context?.subscriptions?.[copilotName]?.count || 0) + 1
                            },
                        }
                    }
                }
            );
        }

        return agentAnswer;
    }
}


const mentionsExtractor = ({ input }) => {
    // Regex matches mentions that:
    // - Do not have a word character or dot before them
    // - Start with @ followed by one or more word characters, optionally followed by dots or hyphens
    // - Do not end with a dot, ensuring the mention is properly captured
    const mentionRegex = /(?<![\w.])@\w[\w-]*(?<!\.)/g;

    const mentions = input.match(mentionRegex);

    return mentions;
}
