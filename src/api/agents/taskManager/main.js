const maxIter = 3
const taskManager = async ({ answer, threadLogs, instructions, input, audio, user, thread, options, iterations = 0 }, res) => {
    console.log(`[taskManager] Starting iteration ${iterations}`);

    let currentStep;
    let workflow;

    // Extract Dependencies
    const { models, modules, resources, utils } = taskManager;
    const { createPrompt, getThreadHistory } = utils;
    const { agents } = modules;

    // Extract resources
    const { copilotz, config } = resources;
    const { job } = copilotz || {};
    const { defaultWorkflow } = job || {};
    const { extId: externalId } = thread;

    // 1. Get or Create Task
    // 1.1 Get active task by thread id;
    console.log(`[taskManager] Searching for active task with extId: ${externalId}`);
    let taskDoc = await models.tasks.findOne({ extId: externalId, status: 'active' });
    console.log(`[taskManager] Task found: ${taskDoc ? 'Yes' : 'No'}`);

    const actionModules = {
        submit: () => {
            return 'step completed'
        },
        createTask: async () => {
            const taskData = {
                name: defaultWorkflow.name,
                description: defaultWorkflow.description,
                context: { user },
                extId: externalId,
                status: 'active',
                workflow: defaultWorkflow._id,
                currentStep: defaultWorkflow.firstStep,
            }
            return await models.tasks.create(taskData)
        }
    }

    if (!taskDoc && job && job.defaultWorkflow) {
        console.log(`[taskManager] Creating new task`);
        taskDoc = await actionModules.createTask()
        console.log(`[taskManager] New task created: ${taskDoc._id}`);
    }

    const actionSpecs = {
        submit: `(submit step completion):->'returns string 'step completed'`,
        createTask: `(create new task):->'returns string 'task created'`
    }


    Object.keys(actionModules).forEach(actionName => actionModules[actionName].spec = actionSpecs[actionName])


    if (taskDoc) {

        console.log(`[taskManager] Fetching workflow and current step`);
        workflow = await models.workflows.findOne({ _id: taskDoc.workflow }, { populate: ['steps'] });
        currentStep = await models.steps.findOne({ _id: taskDoc.currentStep }, { populate: ['actions'] });
        if (currentStep?.job?._id && currentStep?.job?._id !== copilotz?.job?._id) {
            const job = await models.jobs.findOne({ _id: currentStep.job }, { populate: ['actions'] });
            copilotz.job = job;
        }

        console.log(`[taskManager] Current step: ${currentStep.name}`);

        // 2. Get current step name, description, instructions, onSubmit, outputSchema and add it into the base instructions;
        const {
            name: stepName,
            instructions: stepInstructions,
            submitWhen: submitWhen,
        } = currentStep;

        if (currentStep?.job?._id && currentStep?.job?._id !== copilotz.job?._id) {
            copilotz.job = currentStep.job;
        }

        copilotz.actions = [...(copilotz.actions || []), ...(copilotz?.job?.actions || []), ...(currentStep?.actions || [])].filter(Boolean);

        // 3. Create Instructions
        const taskManagerPrompt = createPrompt(currentTaskPromptTemplate, {
            workflow: workflow.name,
            workflowDescription: workflow.description,
            steps: workflow.steps.map(step => step.name).join(', '),
            stepInstructions,
            stepName,
            submitWhen
        })

        instructions = taskManagerPrompt + instructions;
    }

    console.log(`[taskManager] Fetching thread history`);
    threadLogs = threadLogs || await getThreadHistory(thread.extId, { functionName: 'taskManager', maxRetries: 10 });

    const functionCallAgent = agents.functionCall;
    Object.assign(functionCallAgent, taskManager)

    console.log(`[taskManager] Calling agent function`);
    const agentResponse = await functionCallAgent({
        actionModules,
        instructions,
        input,
        audio,
        user,
        thread,
        answer,
        options,
        threadLogs: threadLogs
    }, res);
    console.log(`[taskManager] Agent response received`);

    const updateTaskPayload = {};
    agentResponse.answer.functions?.forEach(async (func) => {
        const { name, args, results, status } = func;
        if (name === 'submit') {
            console.log(`[taskManager] Processing submit function: status ${status}`);
            if (status !== 'failed') {
                if (!currentStep.next) {
                    updateTaskPayload.status = 'completed';
                }
                updateTaskPayload.currentStep = currentStep.next;
            } else {
                updateTaskPayload.status = 'failed';
                currentStep.failedNext &&
                    (updateTaskPayload.currentStep = currentStep.failedNext);
            }
            // onSubmit && onSubmit(params, response);
            updateTaskPayload[`context.steps.${workflow.steps.findIndex(step => step._id === currentStep._id)}.submitParams`] = args;
            updateTaskPayload[`context.steps.${workflow.steps.findIndex(step => step._id === currentStep._id)}.submitResponse`] = results;
            console.log('Updating task step...', updateTaskPayload)
        }
    });

    if (Object.keys(updateTaskPayload).length) {
        console.log(`[taskManager] Updating task: ${taskDoc._id}`);
        try {
            await models.tasks.update({ _id: taskDoc._id }, updateTaskPayload);
            console.log(`[taskManager] Task updated successfully`);
        } catch (error) {
            console.error(`[taskManager] Error updating task:`, error);
            // Optionally, you might want to throw this error or handle it in some way
        }

        if (updateTaskPayload.currentStep !== currentStep._id && iterations < maxIter) {
            console.log(`[taskManager] Recursively calling taskManager for next step`);
            return await taskManager({
                input: '',
                actionModules,
                user,
                thread,
                threadLogs: [
                    ...agentResponse?.prompt?.slice(1),
                    {
                        role: 'assistant',
                        content: typeof agentResponse.answer !== 'string'
                            ? JSON.stringify(agentResponse.answer)
                            : agentResponse.answer
                    }
                ],
                options,
                iterations: iterations + 1
            }, res);
        }
    }

    console.log(`[taskManager] Finished iteration ${iterations}`);
    return agentResponse;
}

export default taskManager;


const currentTaskPromptTemplate = `
You are currently working on a task, and your goal is to keep moving it fowrward on the workflow until the task is completed. Here are the details:

## Current Workflow
<workflow>
{{workflow}}: {{workflowDescription}}
</workflow>

## Workflow Steps
Here are the steps in this workflow (in order): 
<steps>
{{steps}}
</steps>

## Step Instructions
Instructions for your current step: 
<currentStep>
{{stepName}}: {{stepInstructions}}
</currentStep>
- DO NOT ask for information that are not defined in the instructions for the current step above! Follow the instructions carefully.
- DO NOT antecipate about the next step, just focus on completing the current one.

## Submit step completion
Submit your the this step using the 'submit' function, when:
<submitWhen>
{{submitWhen}}
</submitWhen>
- YOU MUST submit AS SOON AS the condition of \`submitWhen\` has been satisfied, NOT BEFORE AND NOR AFTER THAT.
- When you submit, just let the user know in your message that you are updating the status, AND NOTHING MORE.

An excellent response will focus solely on the current step, ensuring that the required information is collected before proceeding.
================
`;


