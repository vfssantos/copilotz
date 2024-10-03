
const getJob = async (req) => {
    const { resources, models } = getJob;

    const { copilotz } = resources;

    if (!copilotz.job) return;

    const job = await models.jobs.findOne({ _id: copilotz.job }, { populate: ['actions'] });

    const workflowIds = job.workflows || [job.defaultWorkflow];

    const workflows = await Promise.all(workflowIds.map(async (workflow) => {
        return await models.workflows.findOne({ _id: workflow }, { populate: ['steps'] });
    }));

    job.workflows = workflows;

    copilotz.job = job;

    getJob.resources.copilotz = copilotz;

    return req;
}

export default getJob;