
const getCopilotz = async (req) => {

    const { extId, copilotzId, channel } = req.params;
    const { models } = getCopilotz;

    let copilotzDoc;

    if (copilotzId || extId) {

        if (copilotzId) {
            // Firts, try to find the Copilotz by its id
            copilotzDoc = await models.copilotz.findOne({
                _id: copilotzId,
            });
        }
        // If not found, try to find the Copilotz by its external id
        else if (extId) {
            const mapper = await models.mappings.findOne({
                extId,
                resource: 'copilotz',
                type: channel,
            }, { populate: ['copilotz'] });

            copilotzDoc = mapper.copilotz
        };

        // If no Copilotz found, return an error
        if (!copilotzDoc) {
            throw { status: 404, message: 'Copilotz not found' };
        }

        const actions = await Promise.all(copilotzDoc?.actions?.map(async (action) => {
            return await models.actions.findOne({ _id: action });
        }) || []);

        copilotzDoc.actions = actions;

        getCopilotz.resources.copilotz = copilotzDoc;

        return req;
    }
}

export default getCopilotz;