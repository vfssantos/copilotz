const logQueue: any[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let isRunning = false;

const processLogQueue = async () => {
    if (isRunning) return;
    // console.log('TASKS QUEUE', logQueue)
    const errors = []
    isRunning = true;
    while (logQueue.length) {
        const logTask = logQueue.shift();
        try {
            await logTask();
        } catch (error) {
            console.error("Failed to process log:", error);
            errors.push(logTask);
        }
    }
    isRunning = false;
    if (errors.length) {
        logQueue.push(...errors);
        return processLogQueue();
    }
};

setInterval(processLogQueue, 1000)

export const beforeRun = ({ name, url, requestId, executionId, input, properties }) => {
    const { models } = beforeRun;
    if (models?.logs) {
        logQueue.push(() => models.logs.create({
            name,
            url,
            requestId,
            executionId,
            input: Object.entries(input).reduce((acc: any, [key, value]) => {
                acc[key] = value;
                return acc;
            }, {}),
        }));
    }
    // console.log("Before run", JSON.stringify({ name, url, requestId, executionId, input }));
    return
}

export const afterRun = ({ name, url, requestId, status, executionId, output, duration, properties }) => {
    const { models } = afterRun;
    if (models?.logs) {
        // async update with promise
        logQueue.push(() => models.logs.update({ executionId }, {
            duration,
            status,
            output,
        }));
    }
    // console.log("After run", JSON.stringify({ name, url, requestId, executionId, output, duration }));
    return
}