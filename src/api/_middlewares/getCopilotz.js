async function getCopilotz(req) {

    const { models } = this;

    const data = req?.data || {};
    const resources = data?.resources || {};

    const config = { ...data?.config, ...resources?.config };

    const { copilotzId, ..._config } = config;

    if (!copilotzId) {
        throw { status: 400, message: 'Copilotz not found' };
    }

    let copilotzDoc = await models.copilotz.findOne({
        _id: copilotzId,
    }, { populate: ['configs', 'workflows'] });

    if (!copilotzDoc) {
        throw { status: 404, message: 'Copilotz not found' };
    }

    const actions = await Promise.all(copilotzDoc?.actions?.map(async (action) => {
        return await models.actions.findOne({ _id: action });
    }) || []);

    copilotzDoc.actions = actions;

    data.resources = { ...resources, copilotz: copilotzDoc };
    data.config = { ...config, ..._config };

    req.data = data;

    return req;
}

export default getCopilotz;