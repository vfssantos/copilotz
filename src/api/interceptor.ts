//max value length for sanitization is 100kb
const MAX_VALUE_LENGTH = 1024 * 100;

function sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
        return typeof obj === 'string' && obj.length > MAX_VALUE_LENGTH ? 'VALUE_TOO_LARGE' : obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
    }

    return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [key, sanitizeObject(value)])
    );
}

async function beforeRun({ name, url, requestId, executionId, input, properties }: {
    name: string;
    url: string;
    requestId: string;
    executionId: string;
    input: any;
    properties: any;
}) {


    const { models } = this;
    if (models?.logs) {
        const sanitizedInput = sanitizeObject({ ...input })
        const tags = properties?.__tags__;
        models.logs.create({
            name,
            url,
            requestId,
            executionId,
            input: sanitizedInput,
            tags
        }, { async: true })
    }
    return
}

async function afterRun({ name, url, requestId, status, executionId, output, duration, properties }: {
    name: string;
    url: string;
    requestId: string;
    status: string;
    executionId: string;
    output: any;
    duration: number;
    properties: any;
}) {

    const { models } = this;
    if (models?.logs) {
        // check if output is an Error
        if (output instanceof Error) {
            output = {
                message: output.message,
                stack: output.stack
            }
        }
        const sanitizedOutput = sanitizeObject(output)
        const tags = properties.__tags__;
        if (typeof sanitizedOutput === 'object' && sanitizedOutput !== null) {
            const { __tags__, ...rest } = sanitizedOutput;
            output = rest;
            __tags__ && Object.assign(tags || {}, __tags__);
        } else {
            output = sanitizedOutput;
        }
        models.logs.update({ executionId }, {
            duration,
            status,
            output,
            tags
        }, { async: true })
    }
    return
}

export { beforeRun, afterRun }