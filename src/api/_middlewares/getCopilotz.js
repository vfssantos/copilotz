
const getCopilotz = async (req) => {

    const { config: _config } = req.params;
    const { copilotzId, ...config } = _config;
    const { models } = getCopilotz;

    let copilotzDoc;

    if (copilotzId) {

        if (copilotzId) {
            // Firts, try to find the Copilotz by its id
            copilotzDoc = await models.copilotz.findOne({
                _id: copilotzId,
            });
        }
        // If no Copilotz found, return an error
        if (!copilotzDoc) {
            throw { status: 404, message: 'Copilotz not found' };
        }

        const actions = await Promise.all(copilotzDoc?.actions?.map(async (action) => {
            return await models.actions.findOne({ _id: action });
        }) || []);

        copilotzDoc.actions = actions;

        getCopilotz.resources.copilotz = copilotzDoc;
        getCopilotz.resources.config = config;

        return req;
    } else {
        throw { status: 400, message: 'Copilotz not found' };
    }
}

export default getCopilotz;