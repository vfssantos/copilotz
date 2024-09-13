import {
    getUser,
    getCopilotz,
    getConfig,
    getJob,
    getSubscription,
} from './_middlewares/main.js';

const middleware: any = async (req: any) => {

    middleware.resources = middleware.resources || {};

    const middlewares = [
        getUser,
        getCopilotz,
        getConfig,
        getJob,
        getSubscription,
    ];

    for (const middlewareFn of middlewares) {
        Object.assign(middlewareFn, middleware);
        await middlewareFn(req);
        Object.assign(middleware, middlewareFn);
    }

    return req;

}

export default middleware;