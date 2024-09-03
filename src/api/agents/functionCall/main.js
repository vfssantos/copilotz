import { jsonrepair } from "npm:jsonrepair";
import validate, { expandAndMergeDotNotation } from "axion-modules/connectors/validator.ts";

export default async function functionCall({ outputSchema, inputSchema, overrideBaseInputSchema, overrideBaseOutputSchema, instructions, input, output, user, thread, options }, res) {

  // 1. Extract Modules, Resources, Utils, and Dependencies
  const { modules, resources, utils } = functionCall;

  // 1.1 Extract Utils
  const { createPrompt, _ } = utils;

  // 1.2 Extract Resources
  const { copilotz } = resources;

  const baseInputSchema = overrideBaseInputSchema || _baseInputSchema;
  const baseOutputSchema = overrideBaseOutputSchema || _baseOutputSchema;

  // 1.3. Extract and Merge Schemas
  inputSchema = inputSchema ? mergeSchemas(overrideBaseInputSchema, inputSchema) : baseInputSchema;
  outputSchema = outputSchema ? mergeSchemas(overrideBaseOutputSchema, outputSchema) : baseOutputSchema;
  // 2. Define Function Call Methods and Specs
  let actions = {};
  if (copilotz?.tools.length) {

    const actionsArray = await Promise.all(copilotz.tools.map(async tool => {
      const [specParser, actionModule] = await Promise.all([
        // 1. Get action spec parser
        import(new URL(`../../actions/specParser/${tool.specType}`, import.meta.url)).then((module) => module.default),
        // 2. Get action module
        tool.moduleUrl?.startsWith('http')
          ? import(tool.moduleUrl).then((module) => module.default)
          : tool.moduleUrl?.startsWith('native:')
            ? import(new URL(`../../actions/modules/${tool.moduleUrl.slice(7)}`, import.meta.url)).then((module) => module.default)
            : { error: true, status: 400, message: `Invalid Module URL: namespace for ${tool.moduleUrl} not found. Should either start with 'http:', 'https:', or 'native:'.` }
      ]);

      // 2. Check for errors
      if (actionModule.error) throw actionModule

      // 3. Add current dependecies to actionModule and specParser
      Object.assign(actionModule, functionCall)
      Object.assign(specParser, functionCall)

      // 4. Parse spec
      const action = specParser({ spec: tool.spec, module: actionModule });
      return action
    }))

    // 5. Reduce actionsArray to actionsObj
    const actionsObj = actionsArray.reduce((acc, obj) => {
      Object.assign(acc, obj)
      return acc
    }, {})

    // 6. Expand and merge to dot notation;
    actions = expandAndMergeDotNotation(actionsObj);

  }

  // 3. Get Action Specs
  const actionSpecs = Object.entries(actions).reduce((acc, [name, action]) => {
    return { ...acc, [name]: action.spec }
  }, {})


  const functionsPrompt = createPrompt(promptTemplate, {
    responseFormatPrompt: createPrompt(responseFormatPromptTemplate({ outputSchema, inputSchema }), {}),
    functionCallsPrompt: createPrompt(functionCallsPromptTemplate, {
      availableFunctions: JSON.stringify(actionSpecs),
    }),
  });

  const formatedInput = input ? JSON.stringify(validate(jsonSchemaToShortSchema(inputSchema), { "message": input })) : '';

  let agentResponse = {};
  if (!output?.answer) {
    const chatAgent = modules.agents.chat;
    Object.assign(chatAgent, functionCall);
    agentResponse = await modules.agents.chat(
      { output, user, thread, options, input: formatedInput, instructions: (instructions + functionsPrompt) },
      { ...res, stream: options?.streamResponse ? streamMiddleware(res.stream) : () => { } },
    );
  }

  if (output?.answer || agentResponse?.answer) {
    let answerJson = {};
    let unvalidatedAnswerJson;
    try {
      unvalidatedAnswerJson = JSON.parse(jsonrepair(agentResponse?.answer || '{}'));
      unvalidatedAnswerJson = {
        ...output?.answer,
        ...unvalidatedAnswerJson,
        functions: [
          ...output?.answer?.functions ?? [],
          ...unvalidatedAnswerJson.functions ?? []
        ]
      };

      answerJson = validate(
        jsonSchemaToShortSchema(outputSchema),
        unvalidatedAnswerJson,
        { optional: false, path: '$' }
      );

    } catch (err) {
      let errorMessage;
      answerJson.continueProcessing = false;
      answerJson.functions = [];
      console.log("INVALID JSON, Trying again!", err);
      if (typeof err === 'string') {
        errorMessage = err
      } else if (err.message) {
        errorMessage = err.message
      } else {
        errorMessage = "INVALID JSON, Trying again!"
      }
      throw ({ ...agentResponse, answer: { ...(unvalidatedAnswerJson || { answer }), error: { code: "INVALID_JSON", message: errorMessage } } })
    }

    if (answerJson?.functions) {
      answerJson?.functions?.forEach((func, index) => {
        func.startTime = new Date().getTime();
        if (!func.name) {
          return delete answerJson.functions[index];
        }
        const functionCall = _.get({ ...adapters, ...actions }, func.name);
        if (!functionCall) {
          console.log("Action Not Found", func.name);
          func.results =
            `Function ${func.name} not found. Please, check and try again`
        } else {
          func.results = functionCall({ ...func.args, _user: user });
        }
      });

      // resolve all promises in action.results
      answerJson.functions = await Promise.all(
        answerJson.functions.filter(Boolean).map(async (func) => {
          if (func.results && func.results.then) {
            func.results = await func.results;
          }
          if (!func.results) {
            func.results = { message: "function call returned `undefined`" }
          }
          return func;
        }),
      );
    }

    agentResponse.answer = answerJson;
  };
  return agentResponse
};


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
- Use 'continueProcessing' to indicate if the assistant should continue actions without waiting for user input.
- Set 'continueProcessing' to \`false\` when you need user interaction to proceed. Note that this property is required.
- Look back in your previous message to see the results of your last function calls. Do not repeat the same function calls. I repeat, do not repeat the same function calls.
- If a function fails, diagnose if there's any error in the args you've passed. If so, retry. If not, provide a clear message to the user.
- Accurately update each step's status and reflection.
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
            "type": "null",
            "description": "To be filled with function result"
          }
        },
        "required": ["name", "args", "results"]
      },
      "description": "List of functions"
    },
    "message": {
      "type": "string",
      "description": "Message for the user"
    },
    "continueProcessing": {
      "type": "boolean",
      "description": "`false` implies waiting for user input and perform no further action in this run. `true` implies continue processing either for waiting action result or proceed with other steps in this run."
    }
  },
  "required": ["functions", "message", "continueProcessing"]
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