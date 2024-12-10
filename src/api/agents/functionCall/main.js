// functionCall.main.js

import { jsonrepair } from "npm:jsonrepair";
import validate, { getDotNotationObject } from "axion-modules/connectors/validator.ts";

// Define Configs
const maxIter = 5;

async function functionCall(
  {
    threadLogs,
    outputSchema,
    actionModules,
    inputSchema,
    overrideBaseInputSchema,
    overrideBaseOutputSchema,
    instructions,
    input,
    audio,
    media,
    answer,
    user,
    thread,
    agentType,
    options,
    iterations = 0,
  },
  res
) {
  agentType = agentType || 'functionCall';

  console.log(`[functionCall] Starting iteration ${iterations}`);

  let actions = {};
  actionModules = actionModules || {};

  // 1. Extract Modules, Resources, Utils, and Dependencies
  const { modules, resources, utils, env } = this || functionCall;

  const { actionExecutor, agents } = modules;

  // 1.1 Extract Utils
  const { createPrompt, _, getThreadHistory, jsonSchemaToShortSchema, mergeSchemas } = utils;

  // 1.2 Extract Resources
  const { copilotz, config } = resources;

  // 1.3 Override Base Schemas
  const baseInputSchema = overrideBaseInputSchema || _baseInputSchema;
  const baseOutputSchema = overrideBaseOutputSchema || _baseOutputSchema;

  // 1.4. Extract and Merge Schemas
  inputSchema = inputSchema ? mergeSchemas(baseInputSchema, inputSchema) : baseInputSchema;
  outputSchema = outputSchema ? mergeSchemas(baseOutputSchema, outputSchema) : baseOutputSchema;

  // 2. Define Function Call Methods and Specs
  if (copilotz?.actions?.length) {
    console.log(`[functionCall] Processing ${copilotz.actions.length} actions`);

    // 2.1. Execute actions
    const actionsObj = (await Promise.all(
      copilotz.actions.map(async (_action) => {
        const action = await actionExecutor({
          specs: _action.spec,
          specType: _action.specType,
          module: _action.moduleUrl
        })
        return action;
      })
    )) // 2.2. Merge actions
      .reduce((acc, obj) => {
        Object.assign(acc, obj);
        return acc;
      }, {})

    // 2.2. Expand and merge to dot notation;
    actions = getDotNotationObject(actionsObj);
  }

  // 2.8. If inherited actionModules, run actions with the same name through actionModules as hooks

  Object.keys(actionModules).forEach((actionModule) => {
    const action = actions[actionModule];
    if (action) {
      actions[actionModule] = (args) => actionModules[actionModule](args, action)
      Object.assign(actions[actionModule], action)
    }
    else {
      actions[actionModule] = actionModules[actionModule]
    }
  });

  // 3. Get Action Specs
  const actionSpecs = Object.entries(actions)
    .map(([name, action]) => {
      return `${name}${action.spec}`;
    })
    .join('\n');

  console.log(`[functionCall] Generated ${Object.keys(actions).length} action specs`);

  // 4. Create Prompt
  const functionsPrompt = createPrompt(instructions || promptTemplate, {
    responseFormatPrompt: createPrompt(
      responseFormatPromptTemplate({ outputSchema, inputSchema }, jsonSchemaToShortSchema),
      {}
    ),
    functionCallsPrompt: createPrompt(functionCallsPromptTemplate, {
      availableFunctions: actionSpecs,
    }),
  });

  // 5. Validate and Format Input
  const formattedInput = input
    ? JSON.stringify(validate(jsonSchemaToShortSchema(inputSchema), { message: input }))
    : '';

  // 6. Get Thread Logs
  console.log(`[functionCall] Fetching thread history`);
  if (!threadLogs || !threadLogs?.length) {
    const lastLog = await getThreadHistory(thread.extId, { functionName: 'functionCall', maxRetries: 10 })
    if (lastLog) {
      const { prompt, ...agentResponse } = lastLog;
      threadLogs = prompt || [];
      const validatedLastAgentResponse = validate(jsonSchemaToShortSchema(outputSchema), agentResponse);
      threadLogs.push({ role: 'assistant', content: JSON.stringify(validatedLastAgentResponse) });
    } else {
      threadLogs = [];
    }
  }

  // 7. Call Chat Agent
  console.log(`[functionCall] Calling chat agent`);
  const chatAgent = agents.chat;
  const chatAgentResponse = await chatAgent.bind(this)(
    {
      threadLogs,
      answer,
      user,
      thread,
      options,
      input: formattedInput,
      audio,
      agentType,
      instructions: functionsPrompt,
    },
    res
  );
  console.log(`[functionCall] Chat agent response received`);

  let functionAgentResponse = {};


  // 8. Validate and Format Output
  if (chatAgentResponse?.message) {
    console.log(`[functionCall] Validating and formatting output`);
    let responseJson = {};
    try {
      const unvalidatedResponseJson = JSON.parse(jsonrepair(chatAgentResponse.message));

      responseJson = validate(
        jsonSchemaToShortSchema(outputSchema),
        unvalidatedResponseJson,
        {
          optional: false,
          path: '$',
          rejectExtraProperties: false,
        }
      );

      functionAgentResponse = {
        ...chatAgentResponse,
        ...responseJson,
        consumption: {
          type: 'actions',
          value: responseJson?.functions?.length || 0,
        },
      };

      console.log(`[functionCall] Sending message to user`);

      if (functionAgentResponse?.functions?.some((func) => func.name === 'callback')) {
        const callbackIndex = functionAgentResponse.functions.findIndex((func) => func.name === 'callback');

        functionAgentResponse = {
          ...functionAgentResponse,
          ...responseJson.functions[callbackIndex]?.args,
        };

        functionAgentResponse.functions.splice(callbackIndex, 1);
      }

      config.streamResponseBy === 'turn' && res.stream(`${JSON.stringify(functionAgentResponse)}\n`);
    } catch (err) {
      let errorMessage;
      responseJson.functions = [];
      console.log('[functionCall] INVALID JSON, Trying again!', err, 'answer:', chatAgentResponse.message);
      if (typeof err === 'string') {
        errorMessage = err;
      } else if (err.message) {
        errorMessage = err.message;
      } else {
        errorMessage = 'INVALID JSON, Trying again!';
      }
      throw {
        ...chatAgentResponse,
        ...responseJson,
        error: { code: 'INVALID_JSON', message: errorMessage },
      };
    }

    // 9. Execute Functions
    console.log('[functionCall] Available actions:', Object.keys(actions));
    if (functionAgentResponse?.functions) {
      console.log(`[functionCall] Executing ${functionAgentResponse.functions.length} functions`);
      functionAgentResponse.functions = await Promise.all(
        functionAgentResponse.functions.map(async (func) => {
          func.startTime = new Date().getTime();
          if (!func.name) return null;

          const action = _.get(actions, func.name);
          if (!action) {
            console.log(`[functionCall] Action not found: ${func.name}`);
            func.status = 'failed';
            func.results = `Function ${func.name} not found. Please, check and try again`;
            return func;
          }

          func.status = 'pending';
          try {
            console.log(`[functionCall] Executing function: ${func.name}`);
            const actionResponse = await Promise.resolve(action({ ...func.args, _user: user }));
            if (typeof actionResponse === 'object' && actionResponse.__media__) {
              const { __media__, ...actionResult } = actionResponse;
              // if (config.streamResponseBy === 'turn' && __media__) {
              //   res.stream(`${JSON.stringify({media: __media__})}\n`);
              // }
              functionAgentResponse.media = { ...media, ...__media__ };
              func.results = actionResult;
            } else {
              func.results = actionResponse || { message: 'function call returned `undefined`' };
            }
            func.status = 'ok';
            console.log(`[functionCall] Function ${func.name} executed successfully`);
          } catch (err) {
            console.log('[functionCall] Error executing function', func.name, err);
            func.status = 'failed';
            func.results = { error: { code: 'FUNCTION_ERROR', message: err.message } };
          }

          return func;
        })
      );

      // Remove null entries (functions without names)
      functionAgentResponse.functions = functionAgentResponse.functions.filter(Boolean);
    }
  }

  // 10. Recursion Handling
  if (functionAgentResponse?.functions?.length && iterations < maxIter) {
    if (!Object.keys(actionModules)?.some(actionName => functionAgentResponse.functions.map(func => func.name).includes(actionName))) {
      if (functionAgentResponse?.nextTurn === 'assistant' || functionAgentResponse?.functions?.length) {

        const assistantMessage = JSON.stringify(
          validate(jsonSchemaToShortSchema(_baseOutputSchema), functionAgentResponse)
        );

        // Update threadLogs for recursion, including only relevant properties
        threadLogs.push({
          role: 'assistant',
          content: assistantMessage,
        });

        console.log(`[functionCall] Recursively calling functionCall for next iteration`);

        return await functionCall.bind(this)(
          {
            input: '',
            media: functionAgentResponse.media,
            actionModules,
            user,
            thread,
            threadLogs,
            instructions,
            options,
            iterations: iterations + 1,
            agentType,
          },
          res
        )
      }
    }
  }

  console.log(`[functionCall] Finished iteration ${iterations}`);
  // 11. Return Response
  return functionAgentResponse;
};

export default functionCall;

const promptTemplate = `
{{copilotPrompt}}
================
{{functionCallsPrompt}}
================
{{responseFormatPrompt}}
================
{{currentDatePrompt}}
================
`;

const functionCallsPromptTemplate = `
## FUNCTION CALLS

You have the following functions you can call:

<availableFunctions>
{{availableFunctions}}
</availableFunctions>

Guidelines:
- Function definitions are formatted as:
  \`function_name(function_description): arg_1<type>(description), arg_2<type>(description), ..., arg_n<type>(description)->(response_description), response_param_1<type>(description), response_param_2<type>(description), ..., response_param_n<type>(description)\`
- "!" before "arg_" is only to inform you that the argument is required, otherwise, they're optional. Do not include "!" in your function call.
- Do not attempt to call functions that are not listed here. If there are no functions listed, do not call any functions.
`;

const responseFormatPromptTemplate = ({ outputSchema, inputSchema }, jsonSchemaToShortSchema) => `
## FORMATTING

User Input Format:
${JSON.stringify(jsonSchemaToShortSchema(inputSchema, { detailed: true }))}

Assistant Response Format:
${JSON.stringify(jsonSchemaToShortSchema(outputSchema, { detailed: true }))}

Guidelines:
- Valid JSON format is expected in both User Input and Assistant Response. Boolean values should be either \`true\` or \`false\` (not to be confused with string format \`"true"\` and \`"false"\`).
- Only the <message> content is visible to the user. Therefore, include all necessary information in the message.
- Parallel functions can be run by adding them to the functions array.
- Look back in your previous message to see the results of your last function calls. 
- If a function fails, diagnose if there's any error in the args you've passed. If so, retry. If not, provide a clear message to the user.
- Specify function names and arguments clearly.
- If you are asking the user for more information or waiting for a user response, set nextTurn to "user". If you have a clear answer, set nextTurn to "assistant".
`;

const _baseOutputSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "message": {
      "type": "string",
      "description": "Assistant message goes here. This is what the user will see. Unless otherwise specified, leave it blank when calling a function.",
    },
    "nextTurn": {
      'type': 'string',
      'description': `Enum ['user', 'assistant']. Who is expected to send the next message.`
    },
    "functions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Function name",
          },
          "args": {
            "type": "object",
            "description": `JSON object (not stringified!) with the function arguments. Ex.: {"arg_name": "arg_value", "arg_name_2": "arg_value_2", ...}`,
          },
          "results": {
            "type": "any",
            "description": "Set as `null`. Will be filled with function result",
          },
          "status": {
            "type": "string",
            "description": "Set as `null`. Will be filled with function result status",
          },
        },
        "required": ["name"],
      },
      "description": "List of functions",
    },
  },
  "required": ["functions", "message", "nextTurn"],
};


const _baseInputSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "message": {
      "type": "string",
      "description": "User message goes here"
    },
  },
  "required": ["message"]
}
