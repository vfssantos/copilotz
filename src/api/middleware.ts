import {
    getUser,
    getCopilotz,
    getConfig,
    getJob,
    getSubscription,
} from './_middlewares/main.js';

const middleware: any = async (req: any) => {

    console.log('got to middlewares @ client', req)

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

    console.log('passed middleware', req);

    return req;

}

export default middleware;