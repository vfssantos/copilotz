async function getConfig(req) {

    const { models } = this;

    if (!req.resources) req.resources = {};

    const { copilotz, config = {} } = req.resources;

    // Get the Copilotz's configuration
    let configsArr = (await models.configs.find({ owner: copilotz._id, type: 'copilotz' })) || [];

    // Join Copilotz's configuration with the config passed by params
    configsArr = [...(copilotz.configs || []), ...(configsArr || [])].filter(c => c?._id)

    // Remove duplicates
    configsArr = configsArr.filter(
        (c, index) => configsArr.findIndex((t) => t?._id === c?._id) === index
    );

    // Convert the configuration array to an object
    const _config = configsArr.reduce((obj, c) => {
        obj[c.name] = c.value;
        return obj;
    }, {});

    req.resources.config = { ...config, ..._config };

    return req;
}

export default getConfig;