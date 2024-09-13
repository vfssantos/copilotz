import schemas from './schemas/main.js';
import crud from 'axion-modules/features/crud/sqLite.js';
import * as security from 'axion-modules/connectors/security.js';

export default ({ env, ...modules }: Record<string, any>) => {

    // Create both local models and remote models
    // Local models will be used for reading data
    // Remote models will be used for writing data

    // const localModels = crud({
    //     schemas,
    //     config: {
    //         dbPath: `file:${Deno.cwd()}/${env.LOCAL_DB_PATH}`,
    //         dbOptions: {
    //             authToken: env.DB_TOKEN,
    //             syncUrl: env.DB_PATH,
    //             syncPeriod: 1,
    //         },
    //         debug: false,
    //         serializer: 'stringifyArrays',
    //         addTimestamps: true
    //     }
    // });

    const remoteModels = crud({
        schemas,
        config: {
            dbPath: env.DB_PATH,
            dbOptions: {
                authToken: env.DB_TOKEN,
            },
            debug: false,
            serializer: 'stringifyArrays',
            addTimestamps: true
        }
    });

    // const models: Record<string, any> = {};
    // Object.keys(schemas).forEach((key) => {
    //     models[key] = {
    //         create: remoteModels[key].create,
    //         createMany: remoteModels[key].createMany,
    //         find: localModels[key].find,
    //         findOne: localModels[key].findOne,
    //         update: remoteModels[key].update,
    //         updateMany: remoteModels[key].updateMany,
    //         delete: remoteModels[key].delete,
    //         deleteMany: remoteModels[key].deleteMany,
    //     }
    // });

    const models=remoteModels;

    const utils = { security }

    return ({
        ...modules,
        env,
        utils,
        models,
    });

}