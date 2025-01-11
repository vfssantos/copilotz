async function getJob(req) {
    const { models } = this;
    const { copilotz } = req.resources;

    if (!copilotz.job) return req;

    const job = await models.jobs.findOne({ _id: copilotz.job }, { populate: ['actions'] });

    const workflowIds = job.workflows || [job.defaultWorkflow];

    const workflows = await Promise.all(workflowIds.map(async (workflow) => {
        return await models.workflows.findOne({ _id: workflow }, { populate: ['steps'] });
    }));

    job.workflows = workflows;

    if (!req.resources) req.resources = {};
    req.resources.copilotz = {
        ...copilotz,
        job
    };

    return req;
}

export default getJob;