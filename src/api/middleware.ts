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
    ];

    for (const middlewareFn of middlewares) {
        req = await middlewareFn.bind({ ...middleware })(req);
    }

    req.params = { ...req.params, ...req.data };

    return req;

}

export default middleware;