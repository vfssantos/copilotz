import * as agents from '../agents/main.js';
import * as ai from '../ai/main.js';

const runCopilotz = async ({ id, channel, input, output }, response) => {

    const { __requestId__, models } = runCopilotz;

    // Get target Copilotz and its related data
    const { copilotz: copilotzDoc } = await models.mappings.findOne({
        $or: [
            { extId: id, },
            { _id: id },
        ],
        resource: 'copilotz',
        type: channel,
    }, { populate: ['copilotz'] });

    const configsArr = await models.configs.find({ owner: copilotzDoc._id, type: 'copilotz' });

    const config = configsArr.reduce((obj, c) => {
        obj[c.name] = c.value;
        return obj;
    }, {});

    // const { tools: toolsDoc, config, ...copilotzDoc } = models.copilotz.findOne({ _id: copilotzId }, { populate: ['tools'] });
    // const jobDoc = models.jobs.findOne({ _id: copilotz.job });
    // const { steps:stepsDoc, ...workflowsDoc } = models.workflows.find({ _id: { $in: jobDoc.workflows } }, { populate: ['steps'] });

    // Simple Chat Agent
    const copilot = agents?.["chat"]

    const response = await copilot({ input, output })

    Object.assign(copilot, {
        resources: {
            copilotz: copilotzDoc,
            config,
            // tools: toolsDoc,
            // job: toolsDoc,
            // workflows: workflowsDoc,
            // steps: stepsDoc
        },
        modules: { models, ai, callback: response.stream },
        __requestId__
    });

    return processedData;

}

export default runCopilotz;