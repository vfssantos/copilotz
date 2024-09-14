//max value length for sanitization is 100kb
const MAX_VALUE_LENGTH = 102400;

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

export const beforeRun = ({ name, url, requestId, executionId, input, properties }: {
    name: string;
    url: string;
    requestId: string;
    executionId: string;
    input: any;
    properties: any;
}) => {
    const { models } = beforeRun as any;
    if (models?.logs) {
        const sanitizedInput = sanitizeObject({ ...input })
        models.logs.create({
            name,
            url,
            requestId,
            executionId,
            input: sanitizedInput
        }, { async: true })
    }
    return
}

export const afterRun = ({ name, url, requestId, status, executionId, output, duration, properties }: {
    name: string;
    url: string;
    requestId: string;
    status: string;
    executionId: string;
    output: any;
    duration: number;
    properties: any;
}) => {
    const { models } = afterRun as any;
    if (models?.logs) {
        // check if output is an Error
        if (output instanceof Error) {
            output = {
                message: output.message,
                stack: output.stack
            }
        }
        const sanitizedOutput = sanitizeObject(output)
        models.logs.update({ executionId }, {
            duration,
            status,
            output: sanitizedOutput,
        }, { async: true })
    }
    return
}

