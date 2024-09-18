import { jsonrepair } from "npm:jsonrepair";
import validate, { getDotNotationObject } from "axion-modules/connectors/validator.ts";

// Define Configs
const maxIter = 5;

const functionCall = async ({ threadLogs, outputSchema, actionModules, inputSchema, overrideBaseInputSchema, overrideBaseOutputSchema, instructions, input, audio, answer, user, thread, options, iterations = 0 }, res) => {
  console.log(`[functionCall] Starting iteration ${iterations}`);

  let actions = {};

  // 1. Extract Modules, Resources, Utils, and Dependencies
  const { modules, resources, utils } = functionCall;

  // 1.1 Extract Utils
  const { createPrompt, _, getThreadHistory } = utils;

  // 1.2 Extract Resources
  const { copilotz, config } = resources;

  // 1.3 Override Base Schemas
  const baseInputSchema = overrideBaseInputSchema || _baseInputSchema;
  const baseOutputSchema = overrideBaseOutputSchema || _baseOutputSchema;

  // 1.4. Extract and Merge Schemas
  inputSchema = inputSchema ? mergeSchemas(overrideBaseInputSchema, inputSchema) : baseInputSchema;
  outputSchema = outputSchema ? mergeSchemas(overrideBaseOutputSchema, outputSchema) : baseOutputSchema;

  // 2. Define Function Call Methods and Specs
  if (copilotz?.actions.filter(_item => _item !== null && _item !== undefined).length) {
    console.log(`[functionCall] Processing ${copilotz.actions.length} actions`);
    // 2.1. For each action available:
    const actionsArray = await Promise.all(copilotz.actions.map(async _action => {
      console.log(`[functionCall] Processing action: ${_action.specType}`);
      const [specParser, actionModule] = await Promise.all([
        // 2.1. Get action spec parser
        import(new URL(`../../_specParser/${_action.specType}`, import.meta.url)).then((module) => module.default),
        // 2.2. Get action module
        _action.moduleUrl?.startsWith('http')
          ? import(_action.moduleUrl).then((module) => module.default)
          : _action.moduleUrl?.startsWith('native:')
            ? import(new URL(`../../modules/${_action.moduleUrl.slice(7)}`, import.meta.url)).then((module) => module.default)
            : { error: true, status: 400, message: `Invalid Module URL: namespace for ${_action.moduleUrl} not found. Should either start with 'http:', 'https:', or 'native:'.` }
      ]);

      // 2.3. Check for errors
      if (actionModule.error) throw actionModule

      // 2.4. Add current dependecies to actionModule and specParser
      Object.assign(actionModule, functionCall)
      Object.assign(specParser, functionCall)

      // 2.5. Parse spec
      const action = specParser({ spec: _action.spec, module: actionModule });
      return action
    }))

    // 2.6. Reduce actionsArray to actionsObj
    const actionsObj = actionsArray.reduce((acc, obj) => {
      Object.assign(acc, obj)
      return acc
    }, {})

    // 2.7. Expand and merge to dot notation;
    actions = getDotNotationObject(actionsObj)

  }
  Object.assign(actions, actionModules)

  // 3. Get Action Specs
  const actionSpecs = Object.entries(actions).map(([name, action]) => {
    return `${name}${action.spec}`
  }).join('\n');

  console.log(`[functionCall] Generated ${Object.keys(actions).length} action specs`);

  // 4. Create Prompt
  const functionsPrompt = createPrompt(promptTemplate, {
    responseFormatPrompt: createPrompt(responseFormatPromptTemplate({ outputSchema, inputSchema }), {}),
    functionCallsPrompt: createPrompt(functionCallsPromptTemplate, {
      availableFunctions: JSON.stringify(actionSpecs),
    }),
  });

  // 5. Validate and Format Input
  const formatedInput = input ? JSON.stringify(validate(jsonSchemaToShortSchema(inputSchema), { "message": input })) : '';

  // 6. Get Thread Logs
  console.log(`[functionCall] Fetching thread history`);
  threadLogs = threadLogs || await getThreadHistory(thread.extId, { functionName: 'functionCall', maxRetries: 10 });

  // 7. Call Agent
  let agentResponse = {};
  console.log(`[functionCall] Calling chat agent`);
  const chatAgent = modules.agents.chat;
  Object.assign(chatAgent, functionCall);
  agentResponse = await chatAgent(
    { threadLogs, answer, user, thread, options, input: formatedInput, audio, instructions: (functionsPrompt + instructions) },
    { ...res, stream: options?.streamResponse ? streamMiddleware(res.stream) : () => { } },
  );
  console.log(`[functionCall] Chat agent response received`);

  // 8. Validate and Format Output
  if (answer || agentResponse?.answer) {
    console.log(`[functionCall] Validating and formatting output`);
    let answerJson = {};
    let unvalidatedAnswerJson;
    try {
      unvalidatedAnswerJson = JSON.parse(jsonrepair(agentResponse?.answer || '{}'));
      unvalidatedAnswerJson = {
        ...answer,
        ...unvalidatedAnswerJson,
        functions: [
          ...answer?.functions ?? [],
          ...unvalidatedAnswerJson.functions ?? []
        ]
      };

      answerJson = validate(
        jsonSchemaToShortSchema(outputSchema),
        unvalidatedAnswerJson,
        {
          optional: false,
          path: '$',
          rejectExtraProperties: false
        }
      );

      console.log(`[functionCall] Sending message to user: ${answerJson.message}`, 'config', config.streamResponseBy);
      config.streamResponseBy === 'turn' && res.stream(`${JSON.stringify(answerJson)}\n`);

      if (answerJson.functions.some(func => func.name === 'callback')) {
        const callbackIndex = answerJson.functions.findIndex(func => func.name === 'callback');
        res.stream(`${JSON.stringify(answerJson.functions[callbackIndex]?.args)}`);
        answerJson.functions.splice(callbackIndex, 1);
      }

    } catch (err) {
      let errorMessage;
      answerJson.functions = [];
      console.log("[functionCall] INVALID JSON, Trying again!", err);
      if (typeof err === 'string') {
        errorMessage = err
      } else if (err.message) {
        errorMessage = err.message
      } else {
        errorMessage = "INVALID JSON, Trying again!"
      }
      throw ({ ...agentResponse, answer: { ...(unvalidatedAnswerJson || output?.answer), error: { code: "INVALID_JSON", message: errorMessage } } })
    }

    // 9. Execute Functions
    console.log('[functionCall] Available actions:', Object.keys(actions));
    if (answerJson?.functions) {
      console.log(`[functionCall] Executing ${answerJson.functions.length} functions`);
      answerJson.functions = await Promise.all(answerJson.functions.map(async (func) => {
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
          const actionResult = await Promise.resolve(action({ ...func.args, _user: user }));
          func.status = 'ok';
          func.results = actionResult || { message: "function call returned `undefined`" };
          console.log(`[functionCall] Function ${func.name} executed successfully`);
        } catch (err) {
          console.log('[functionCall] Error executing function', func.name, err);
          func.status = 'failed';
          func.results = { error: { code: "FUNCTION_ERROR", message: err.message } };
        }

        return func;
      }));

      // Remove null entries (functions without names)
      answerJson.functions = answerJson.functions.filter(Boolean);
    }

    agentResponse.answer = answerJson;
  }

  // 10. If there are functions to be called, call the agent again
  if (agentResponse.answer.functions.length && iterations < maxIter) {
    if (!Object.keys(actionModules)
      .some(actionName => agentResponse.answer.functions.map(func => func.name).includes(actionName))
      || agentResponse.answer.hasFollowUp
    ) {
      console.log(`[functionCall] Recursively calling functionCall for next iteration`);
      return functionCall({
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

  console.log(`[functionCall] Finished iteration ${iterations}`);
  // 10. Return Response
  return agentResponse;
};

export default functionCall;


const promptTemplate = `
{{functionCallsPrompt}}
================
{{responseFormatPrompt}}
================
`;

const functionCallsPromptTemplate = `
You have the following functions you can call:
<availableFunctions>
{{availableFunctions}}
</availableFunctions>
Guidelines:
- Function definitions are formatted as:
  \`function_name(function_description): arg_1<type>(description), arg_2<type>(description), ..., arg_n<type>(description)->(response_description)\`
- "!" before "arg_" is only to inform you that the argument is required, otherwise, they're optional. Do not include "!" in your function call.
- Do not attempt to call functions that are not listed here. If there are no functions listed, do not call any functions.
`;

const responseFormatPromptTemplate = ({ outputSchema, inputSchema }) => `
Response Format:
<answerFormat>
${JSON.stringify(jsonSchemaToShortSchema(outputSchema, { detailed: true }))}
</answerFormat>
- JSON format is expected. Boolean values should be either \`true\` or \`false\` (not to be confused with string format \`"true"\` and \`"false"\`).
- Only the <message> content is visible to the user. Therefore, include all necessary information in the message.
- Parallel functions can be run by adding them to the functions array.

User messages:
<userMessage>
${JSON.stringify(jsonSchemaToShortSchema(inputSchema, { detailed: true }))}
</userMessage>

Guidelines:
- Look back in your previous message to see the results of your last function calls. 
- If a function fails, diagnose if there's any error in the args you've passed. If so, retry. If not, provide a clear message to the user.
- Specify function names and arguments clearly.
`;

const streamMiddleware = (stream) => {
  let text = "";
  let lastMessage = "";


  return (token) => {
    text = text + token;

    try {
      const json = JSON.parse(jsonrepair(text));

      if (json?.message) {

        const lastMessageIndex = json.message.indexOf(lastMessage);

        const [beforeText, deltaText] = [
          json.message.slice(
            0,
            lastMessageIndex,
          ),
          json?.message.slice(
            lastMessageIndex + lastMessage.length,
          ),
        ];

        lastMessage = json?.message;

        (deltaText || beforeText) && stream(deltaText || beforeText);
      }
    } catch (err) {
      // console.log(err)
    }
  };
};

function jsonSchemaToShortSchema(jsonSchema, { detailed } = {}) {

  detailed = detailed ?? false;

  function convertType(type) {
    switch (type) {
      case 'string':
        return 'string';
      case 'number':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'object':
        return 'object';
      case 'array':
        return 'array';
      case 'null':
        return 'null';
      default:
        return 'any';
    }
  }

  function formatProperties(properties, required = []) {
    const result = {};
    for (const key in properties) {
      const prop = properties[key];
      const type = convertType(prop.type);
      const isRequired = required.includes(key);
      const suffix = isRequired ? '!' : '?';
      const description = detailed && prop.description ? ` ${prop.description}` : '';
      if (type === 'object' && prop.properties) {
        result[key] = formatProperties(prop.properties, prop.required);
      } else if (type === 'array' && prop.items) {
        result[key] = [formatProperties(prop.items.properties, prop.items.required)];
      } else {
        result[key] = description ? `<${type + suffix}>${description}</${type + suffix}>` : type + suffix;
      }
    }
    return result;
  }

  return formatProperties(jsonSchema.properties, jsonSchema.required);
}

const _baseOutputSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "message": {
      "type": "string",
      "description": "Message for the user"
    },
    "hasFollowUp": {
      "type": "boolean",
      "description": "If true, the agent will continue the conversation in the next message"
    },
    "functions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Function name"
          },
          "args": {
            "type": "object",
            "description": "{...args,[arg_name]:arg_value}"
          },
          "results": {
            "type": "any",
            "description": "To be filled with function result"
          },
          "status": {
            "type": "string",
            "description": "Function status"
          },
        },
        "required": ["name"]
      },
      "description": "List of functions"
    },
  },
  "required": ["functions", "message", "hasFollowUp"]
}

const _baseInputSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "message": {
      "type": "string",
      "description": "User input message"
    },
  },
  "required": ["message"]
}

function mergeSchemas(schema1, schema2) {
  // Função auxiliar para mesclar propriedades
  function mergeProperties(prop1, prop2) {
    const merged = { ...prop1, ...prop2 };
    if (Array.isArray(prop1) && Array.isArray(prop2)) {
      return mergeArrays(prop1, prop2);
    } else if (prop1.properties && prop2.properties) {
      merged.properties = mergeSchemas(prop1.properties, prop2.properties);
    }
    return merged;
  }

  // Função auxiliar para mesclar arrays sem duplicatas
  function mergeArrays(arr1, arr2) {
    return Array.from(new Set([...(arr1 || []), ...(arr2 || [])]));
  }

  // Mesclar as propriedades principais dos schemas
  const mergedSchema = {
    ...schema1,
    ...schema2,
    properties: {
      ...schema1.properties,
      ...schema2.properties
    },
    required: mergeArrays(schema1.required, schema2.required)
  };

  // Mesclar propriedades individuais
  for (const key in schema1.properties) {
    if (schema2.properties[key]) {
      mergedSchema.properties[key] = mergeProperties(schema1.properties[key], schema2.properties[key]);
    }
  }

  return mergedSchema;
}