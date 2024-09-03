const middlewares: any = async (req: any) => {

    const { models } = middlewares;

    const { extId, copilotzId, channel } = req.params;

    // Get target Copilotz and its related data
    if (copilotzId || extId) {
        let copilotzDoc;

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
            copilotzDoc = mapper
        };

        // If no Copilotz found, return an error
        if (!copilotzDoc) {
            throw { status: 404, message: 'Copilotz not found' };
        }

        // Get the Copilotz's configuration
        const configsArr = await models.configs.find({ owner: copilotzDoc._id, type: 'copilotz' });

        // Convert the configuration array to an object
        const config = configsArr.reduce((obj: any, c: Record<string, string>) => {
            obj[c.name] = c.value;
            return obj;
        }, {});

        // Get Copilotz Tools
        if (copilotzDoc?.tools?.length) {
            const toolsArr = await Promise.all(
                copilotzDoc.tools.map((toolId: number) => models.tools.findOne({ _id: toolId }))
            );
            copilotzDoc.tools = toolsArr;
        }

        // Add the Copilotz to the resources object
        middlewares.resources = {
            copilotz: copilotzDoc,
            config
        }
    }

    return req;
}

export default middlewares;