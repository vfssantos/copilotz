const getConfig = async (req) => {

    const { models, resources } = getConfig;

    const { copilotz, config } = resources;

    // Get the Copilotz's configuration
    const configsArr = await models.configs.find({ owner: copilotz._id, type: 'copilotz' });

    // Convert the configuration array to an object
    const _config = configsArr.reduce((obj, c) => {
        obj[c.name] = c.value;
        return obj;
    }, {});

    getConfig.resources.config = { ...config, ..._config };

    return req;
}

export default getConfig;