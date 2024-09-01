const GET = async ({ account, resource, id, _populate }) => {
    id = Number(id);
    const { models } = GET;
    if (!id) throw { message: 'Missing required fields: id' };
    if (!models?.[resource]) throw { message: 'Resource not found', status: 404 };
    return await models?.[resource]?.findOne({ _id: id }, { populate: _populate?.split(',') });
}
const PUT = async ({ account, resource, id, ...data }) => {
    id = Number(id);
    const { models } = PUT;
    if (!id) throw { message: 'Missing required fields: id' };
    if (!models?.[resource]) throw { message: 'Resource not found', status: 404 };
    return await models?.[resource]?.update({ _id: id }, { ...data });
}
const DELETE = async ({ account, resource, id }) => {
    id = Number(id);
    const { models } = DELETE;
    if (!id) throw { message: 'Missing required fields: id' };
    if (!models?.[resource]) throw { message: 'Resource not found', status: 404 };
    await models?.[resource]?.delete({ _id: id });
    return { _id: id, deleted: true }
}


export {
    GET,
    PUT,
    DELETE
}