import {
    getUser,
    getCopilotz,
    getConfig,
    getJob,
} from './_middlewares/main.js';

const middleware: any = async (req: any) => {

    const middlewares = [
        getUser,
        getCopilotz,
        getConfig,
        getJob,
        getSubscription,
    ];

    for (const middlewareFn of middlewares) {
        req = await middlewareFn.bind({ ...middleware })(req);
    }

    return req;

}

export default middleware;