const GET = async ({ resource, _populate, ...queryParams }) => {
    const { models } = GET;
    if (!models?.[resource]) throw { message: 'Resource not found', status: 404 };
    return {
        data: (await models?.[resource]?.find(queryParams, { populate: _populate?.split(',') })) || []
    }
};
const POST = ({ resource, ...data }) => {
    const { models } = POST;
    if (!models?.[resource]) throw { message: 'Resource not found', status: 404 };
    return models?.[resource]?.create(data);
};

export {
    GET,
    POST
}