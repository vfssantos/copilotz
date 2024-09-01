
export default ({ config, adapters, resources }) => {

    const { models, ai, agent, utils } = adapters;
    const { workflows, tenant, executor, jobs, steps: _steps, subscription } = resources;
    const { Validator, _ } = utils;

    console.log("_STEPS", _steps)

    function createPrompt(template, data) {
        return template.replace(/\{\{(\w+)\}\}/g, function (match, key) {
            return data[key] || '';
        });
    }

    const orderSteps = (step, steps) => {
        let _steps = [];
        if (step?.successNext) {
            _steps = orderSteps(steps.find(s => step.successNext.toString() === s._id.toString()), steps)
        }
        return [step, ..._steps]
    }


    const findOrUpsertTask = async (taskData) => {
        // check if task exists by thread and status is not 'archived' or 'done'.
        let taskDoc = await models.task.findOne(
            {
                externalId: taskData.thread,
                tenant: executor || tenant,
                _unsafe: {
                    workflow: { $in: workflows.map(w => w._id) },
                    status: { $nin: ['archived', 'done'] },
                }
            },
            { populate: ['workflow', 'step'] }
        );
        if (!taskDoc) {
            // create taskDoc if not found
            taskDoc = await models.task.create({ ...taskData, tenant });
        } else {
            // update taskDoc if found and there's any new data
            Object.keys(taskDoc)
                .some((key) => _.isEqual(taskData[key], taskDoc[key])) &&
                models.task.update(
                    { _id: taskDoc._id },
                    { ...taskData, tenant },
                );
        }
        return taskDoc;
    }
    return async ({ workflowClassificationInstructions, stepClassificationInstructions, user: userData, thread, content, input, iter, __executionId__, self, ...rest }, res) => {
        const params = { workflowClassificationInstructions, stepClassificationInstructions, user: userData, thread, content, input, iter, __executionId__, ...rest }
        const maxIter = 3;
        iter = iter || 0;
        if (iter >= maxIter) {
            return { error: 'Max Iterations Reached' }
        }
        const { name, phone, context } = userData;
        const { externalId, ctx } = thread;

        // 1. Get Input
        if (!input) {
            const { text, audio } = content;
            const inputArr = [text];

            // 1. Get Thread Id and Input message
            if (audio) {
                const audioContent = await ai["speech-to-text"]?.({
                    blob: audio,
                });
                inputArr.push(audioContent.text);
            }
            input = inputArr.filter(Boolean).join("/n");
        }

        // 2. Get Current Workflow
        // 2.1. Get the current task
        let taskDoc = (await models.task.findOne({ _unsafe: { workflow: { $in: workflows.map(w => w._id) } }, externalId: externalId, status: 'active' }))

        const workflowDescriptions = workflows.map(w => w.trigger || w.description);
        // 2.2. Get the Current Workflow Index
        let currentWorkflowIndex = workflows.findIndex(w => w._id && (w._id.toString() === taskDoc?.workflow?.toString()));
        let taskCreated;
        if (input) {
            // 2.3. Get the Input Workflow Index
            const inputWorkflowIndex = await agent.intentClassification({ input, categories: workflowDescriptions, currentIndex: currentWorkflowIndex, instructions: workflowClassificationInstructions });
            // 2.4 If the inputWorkflowIndex is different from the currentWorkflowIndex, then create a new task
            if (
                (typeof currentWorkflowIndex !== 'undefined' && (currentWorkflowIndex !== inputWorkflowIndex))
                && inputWorkflowIndex > -1
            ) {
                currentWorkflowIndex = inputWorkflowIndex;
                if (taskDoc) {
                    // 2.5 Update original task status to 'backlog'.
                    models.task.update({ _id: taskDoc._id }, { status: 'backlog' });
                }
                // 2.6 Change workflow, create a new task
                taskCreated = true;
                taskDoc = await findOrUpsertTask({
                    name: `${workflows[inputWorkflowIndex].name}-${name}-${phone}-${new Date().toISOString()}`,
                    description: workflows[inputWorkflowIndex].description,
                    externalId: String(externalId),
                    workflow: workflows[inputWorkflowIndex]._id,
                    step: workflows[inputWorkflowIndex].firstStep,
                    state: Validator(workflows[inputWorkflowIndex].schema, {}, { clean: false }),
                    status: 'active',
                });
            }
        }
        // 3. Get current step
        const workflow = workflows[currentWorkflowIndex];
        let instructions;
        let steps;
        let step;
        let currentStepIndex = -1;

        if (workflow) {
            steps = orderSteps(_steps.find(s => workflow.firstStep.toString() === s._id.toString()), _steps);
            currentStepIndex = steps.findIndex(s => s?._id?.toString() === taskDoc?.step?.toString());
            let inputStepIndex = currentStepIndex;
            if (input && !taskCreated) {
                inputStepIndex = await agent.intentClassification({
                    input,
                    categories: steps.map(i => i.description),
                    currentIndex: currentStepIndex,
                    instructions: stepClassificationInstructions,
                })
            }

            currentStepIndex = Math.max(Math.min(inputStepIndex, currentStepIndex), 0);
            step = steps[currentStepIndex];

            //4. Get instructions
            instructions = createPrompt(currentTaskPromptTemplate, {
                workflow: workflow.name,
                workflowInstructions: workflow.instructions,
                stepName: step.name,
                steps: steps.map((s, i) => `- ${i + 1}. ${s.description}`).join('\n'),
                stepInstructions: step.instructions,
                nextStepName: steps[currentStepIndex + 1]?.name,
                nextStepInstructions: steps[currentStepIndex + 1]?.instructions
            })
        }

        let agentResponse
        try {
            // 5. Call the 'function call' agent
            agentResponse = await agent.functionCall({
                ...params,
                instructions: [params.instructions, instructions].filter(i => i).join('/n'),
                input,
                __tags__: {
                    threadId: externalId,
                    workflow: workflow?._id,
                    step: step?._id,
                    stepName: step?.name,
                    task: taskDoc?._id,
                }
            }, res)
        } catch (err) {
            agentResponse = err;
        }

        // 5.1. Get the consumption values
        const consumption = agentResponse?.consumption || {};

        // 6. Update the task with the from agentResponse if agentResponse.stepCompleted is true
        if (taskDoc && agentResponse?.answer?.step?.isCompleted && !agentResponse.answer.error) {
            // 6.1. Update the task with the from agentResponse
            const nextStep = steps?.[currentStepIndex + 1]?._id;
            if (!nextStep) {
                // 6.2. Update the task status to 'done' if there are no more steps
                models.task.update({ _id: taskDoc._id }, { status: 'done' });
            } else {
                models.task.update({ _id: taskDoc._id }, { step: steps[currentStepIndex + 1]?._id });
            }
        }

        if (agentResponse?.answer?.error || agentResponse?.answer?.continueProcessing) {

            const iterResponse = await self({ user: userData, thread, content: { text: '' }, input: '', iter: (iter + 1), ...rest }, res)
            // 7. Update the consumption values
            if (iterResponse?.consumption) {
                for (const [key, value] of Object.entries(iterResponse.consumption)) {
                    if (typeof value === 'number' && typeof consumption[key] === 'number') {
                        consumption[key] = (consumption[key] || 0) + value;
                    }
                }
            }
        }

        // return response
        return { ...agentResponse, consumption }; // to do: add consumption for tasks;
    };

}

const currentTaskPromptTemplate = `
You are currently working on a task, and your goal is to keep moving it fowrward on the workflow until the task is completed. Here are the details:
Current Workflow: 
<workflow>
{{workflow}}: {{workflowDescription}}
</workflow>
Here are the steps in this workflow (in order): 
<steps>
{{steps}}
</steps>
Instructions for your current step: 
<currentStep>
{{stepName}}: {{stepInstructions}}
</currentStep>
An excellent response will provide a thoughtful answer, but also guide the conversation back towards completing your task.
================
`;