
const getJob = async (req) => {
    const { resources, models } = getJob;

    const { copilotz } = resources;

    if (!copilotz.job) return;

    const job = await models.jobs.findOne({ _id: copilotz.job }, { populate: ['actions'] });

    const workflow = await models.workflows.findOne({ _id: job.defaultWorkflow }, { populate: ['steps'] });

    job.defaultWorkflow = workflow;

    copilotz.job = job;

    getJob.resources.copilotz = copilotz;

    return req;
}

export default getJob;