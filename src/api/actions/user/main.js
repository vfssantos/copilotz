
export default ({ models, tenant }) => {
    const { _ } = utils;
    return {
        findOrUpsert: async (userData) => {
            // check if user exists by phone.
            // TO DO: add dynamic property for user lookup
            let userDoc = await models.user.findOne({
                phone: userData.phone,
                tenant,
            });
            if (!userDoc) {
                // create userDoc if not found
                userDoc = await models.user.create({ ...userData, tenant });
            } else {
                // update userDoc if found and there's any new data
                Object.keys(userData)
                    .some((key) => _.isEqual(userData[key], userDoc[key])) &&
                    models.user.update(
                        { _id: userDoc._id },
                        { ...userData, tenant },
                    );
            }
            return userDoc;
        },
        setContext: async (userData, contextData) => {
            return await models.user.update(
                { _id: userData._id },
                {
                    context: {
                        ...userData.context,
                        ...contextData
                    }
                },
            );
        }
    };
};
