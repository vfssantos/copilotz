import { jsonrepair } from "npm:jsonrepair";

function createPrompt(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, function (match, key) {
    return data[key] || '';
  });
}

export default ({ config, adapters, resources }) => {

  const { tools, subscription } = resources;

  const { utils, agent, callback, dynamicImport } = adapters;
  const { _, getDotNotationObject, expandAndMergeDotNotation, Validator } = utils

  return async function functionCall({ instructions, user, input, answer, content, thread, __tags__, __executionId__, ...rest }, res) {

    let actions = {};
    if (tools?.length) {
      actions = expandAndMergeDotNotation(
        await Promise.all(tools.map(async tool => {
          const action = await dynamicImport({ keys: ['actions', tool.type] }, { resources: { subscription, user, tools: tools.filter(t => t.type === tool.type) } })
          if (typeof action === 'function') {
            const { metadata } = action
            return { [metadata.keys.join('.')]: action }
          }
          const { ...methods } = action;
          const newMethods = {};
          const methodKeys = Object.keys(methods);
          methodKeys.forEach(k => {
            if (typeof methods[k] !== 'function') return;
            const { metadata } = methods[k];
            newMethods[`${metadata.keys.join('.')}.${k}`] = methods[k];
          })
          return newMethods;
        }))
      ).reduce((acc, obj) => {
        Object.assign(acc, obj)
        return acc
      }, {})
    }


    const params = { instructions, content, thread, input, __tags__, __executionId__, ...rest };

    if (!__tags__?.turnId) __tags__.turnId = __executionId__;

    // 0. Get Input
    if (!input) {
      const { text, audio } = content;
      const inputArr = [text];

      // 1. Get Thread Id and Input message
      if (audio) {
        const textFromAudio = await ai["speech-to-text"]?.({
          blob: audio,
        });
        inputArr.push(textFromAudio);
      }
      input = inputArr.filter(Boolean).join("/n");
    }

    // 1. Get Action Specs
    const getActionSpecs = (actionObj) => {
      return Object.keys(actionObj).map((key) => {
        if (typeof actionObj[key]?.spec === 'string') {
          return { [key]: actionObj[key].spec }
        } else if (typeof actionObj[key] === 'object') {
          return { ...actionObj, [key]: getActionSpecs(actionObj[key]) }
        }
        return null
      }).filter(Boolean).reduce((acc, v) => ({ ...acc, ...v }), {})
    }

    const actionSpecs = Object.entries(getDotNotationObject(getActionSpecs(actions))).map(v => v.join('')).join('\n');

    const functionsPrompt = createPrompt(promptTemplate, {
      responseFormatPrompt: createPrompt(responseFormatPromptTemplate, {}),
      functionCallsPrompt: createPrompt(functionCallsPromptTemplate, {
        availableFunctions: actionSpecs,
      }),
    });

    const formatedInput = input ? JSON.stringify({ "message": input, step: { name: __tags__.stepName } }) : '';
    let agentResponse = {};
    if (!answer?.message) {
      agentResponse = await agent.chat(
        { ...params, __tags__, input: formatedInput, instructions: (instructions + functionsPrompt) },
        { ...res, stream: config?.streamResponse ? streamMiddleware(res.stream) : () => { } },
      );
    }

    if (answer || agentResponse?.answer) {
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

        answerJson = Validator({
          step: {
            name: "string",
            reflection: "string",
            isCompleted: "boolean",
          },
          functions: [{
            name: "string",
            args: "any",
            results: "any",
          }],
          message: "string!",
          continueProcessing: "boolean",
          error: "any",
        }, unvalidatedAnswerJson, { optional: false, path: '$' });

        answerJson.step = { name: __tags__.stepName, ...answerJson.step };
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
      if (answerJson.message) {
        let callbackArgs = {}
        const callbackIndex = answerJson?.functions?.findIndex(f => f.name === 'callback');
        if (callbackIndex > -1) {
          callbackArgs = answerJson?.functions?.[callbackIndex]?.args
          delete answerJson.functions[callbackIndex];
        }
        callback && callback({
          user,
          thread,
          message: answerJson.message,
          ...callbackArgs,
        });
      }
      if (answerJson?.functions) {
        answerJson?.functions?.forEach((func, index) => {
          func.startTime = new Date().getTime();
          if (!func.name) {
            return delete answerJson.functions[index];
          }
          const functionCall = _.get({ ...adapters, ...actions}, func.name);
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
}

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

const responseFormatPromptTemplate = `
Response Format:
<answerFormat>
${JSON.stringify({
  "step": {
    "name": "<string>step name</string>",
    "reflection": "<string>brief reflection on completing this step</string>",
    "isCompleted": "<boolean>`true` if step is done, `false` otherwise.</boolean>",
  },
  "functions": [{
    "name": "<string>function_name</string>",
    "args": "<object>{...args,[arg_name]:arg_value}</object>",
    "results": "<null>to be filled with function result</null>",
  }],
  "message": "<string>message for the user</string>",
  "continueProcessing": "<boolean>`true` if the assistant has more actions to perform without waiting for user interaction, `false` implies waiting for user input</boolean>",
})}
</answerFormat>
- JSON format is expected. Boolean values should be either \`true\` or \`false\` (not to be confused with string format \`"true"\` and \`"false"\`).
- Only the <message> content is visible to the user. Therefore, include all necessary information in the message.
- Parallel functions can be run by adding them to the functions array.

User messages:
<userMessage>
${JSON.stringify({
  "message": "<string>user message</string>",
  "step": {
    "name": "<string>step name</string>",
  },
})}
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
