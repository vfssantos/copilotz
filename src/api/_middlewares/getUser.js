async function getUsers(req) {
    const { models } = this;

    if (!req.params?.user?.phone && !req.params?.user?.email) return req;

    if (!req.resources) req.resources = {};

    let usersPhonePromise, usersEmailPromise;
    if (req.params?.user?.phone) {
        usersPhonePromise = models.users.findOne({ phone: req.params?.user?.phone });
    }
    if (req.params?.user?.email) {
        usersEmailPromise = models.users.findOne({ email: req.params?.user?.email });
    }

    const usersResolved = await Promise.all([usersPhonePromise, usersEmailPromise]);
    let user = usersResolved[0] || usersResolved[1];

    if (!user) {
        user = await models.users.create({
            phone: req.params?.user?.phone,
            email: req.params?.user?.email,
            name: req.params?.user?.name || 'Guest',
            context: req.params?.user?.context || {},
        });
    }

    req.resources.user = user;

    return req;
}

export default getUsers;