/**
 * Main function for the chat agent.
 * 
* @param {Object} params - Function parameters.
 * @param {string} params.instructions - Instructions for the agent.
 * @param {string|Array<Object>} params.input - User input, can be a string or an array of objects.
 * @param {string} params.input[].type - Type of the input, can be 'text' or 'image_url'.
 * @param {string} [params.input[].text] - Text input, required if type is 'text'.
 * @param {Object} [params.input[].image_url] - Image URL input, required if type is 'image_url'.
 * @param {string} params.input[].image_url.url - URL of the image, can be a regular URL or a base64 encoded image.
 * @param {string} params.input[].image_url.detail - Detail about the image.
 * @param {Object} params.user - User information.
 * @param {Object} params.thread - Thread information.
 * @param {Object} res - Response object.
 * @param {Object} config - Configuration object.
 * @param {Object} config.AI_CHAT_PROVIDER - AI chat provider configuration.
 * @param {string} config.AI_CHAT_PROVIDER.provider - Provider name, e.g., 'openai'.
 * @param {Object} config.AI_CHAT_PROVIDER.options - Additional options for the provider.
 * @param {Object} env - Environment variables.
 * @param {string} env.OPENAI_CREDENTIALS_apiKey - API key for OpenAI.
 * @param {string} env.OTHER_PROVIDER_CREDENTIALS_apiKey - API key for another provider.
 * @returns {Promise<void>} - Returns a Promise that resolves when the function is completed.
 */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const chatAgent = async ({ instructions, input, user, thread, options }, res) => {

  // 1. Extract Modules, Resources, Utils, and Dependencies
  const { __tags__, __requestId__, __executionId__, modules, resources, utils, env, models } = chatAgent;

  // 1.1 Extract Utils
  const { createPrompt } = utils;

  // 1.2 Extract Dependencies
  const { ai } = modules;

  // 1.3 Extract Resources
  const { copilotz, config } = resources;

  // 2. Extract params
  // 2.1 Get Thread and Turn Ids;
  if (__tags__ && !__tags__?.turnId) __tags__.turnId = __executionId__;
  const { extId: threadId } = thread;

  // 3. Get Chat Logs
  const chatLogs = [];
  // 3.1 Get Last Chat Log
  const lastLog = await models.logs.findOne({
    name: "chatAgent", "input.0.thread.extId": threadId
  }, { sort: { createdAt: -1 } });

  // 3.2. If Last Log Exists, Add to Chat Logs
  if (lastLog) {
    let c = 0;
    while (true) {
      if (lastLog.input && !lastLog.output && lastLog.status !== 'failed' && c < 10) {
        sleep(1000)
      } else {
        break;
      }
      c++;
    }
    // 3.2.1 If first message in previous message's prompt history is System Message
    if (lastLog?.output?.prompt?.[0]?.role === 'system') {
      // 3.2.1.1 Remove system message 
      const _messages = Array.isArray(lastLog?.output?.prompt) ? lastLog?.output?.prompt.slice(1) : [];
      // 3.2.1.2 Add previous message's prompt history to current chatLogs
      chatLogs.push(..._messages);
    } else {
      // 3.2.2.1 Add previous message's prompt history to current chatLogs
      lastLog?.output?.prompt && chatLogs.push(...lastLog?.output?.prompt);
    }
    // 3.2.2 Add Last Message's Answer to current chatLogs
    lastLog?.output?.answer && chatLogs.push({ role: 'assistant', content: lastLog?.output?.answer });
  }

  //let's make sure that  content is a string
  chatLogs.map(log => {
    if (typeof log.content !== 'string' && !Array.isArray(log.content)) {
      log.content = JSON.stringify(log.content)
    } else if (Array.isArray(log.content)) {
      log.content = log.content.map(item => {
        if (item.type === 'text') {
          return { ...item, content: JSON.stringify(item.content) }
        }
        return item
      })
    }
    return log
  })

  // 4. Add User Input to Chat Logs
  const message = input && {
    role: "user",
    content: input,
  }
  // 4.1. If User Input Exists, Add to Chat Logs
  message && chatLogs.push(message);

  // 5. Create Prompt
  //5.1 Create Prompt Variables
  const promptVariables = {
    copilotPrompt: createPrompt(
      copilotPromptTemplate,
      {
        name: copilotz.name,
        backstory: copilotz.backstory,
        job: copilotz.job
      }
    ),
    instructions,
    currentDatePrompt: createPrompt(currentDatePromptTemplate, { currentDate: new Date() })
  }

  // 5.2 Create Prompt Instructions
  instructions = createPrompt(promptTemplate, promptVariables)

  // 6. Get AI Chat
  const { provider, ...providerOptions } = config?.AI_CHAT_PROVIDER || { provider: 'openai' }; // use openai as default provider
  const aiChat = ai.chat[provider];

  // 7. Execute AI Chat
  // 7.1. Assign configuration to AI Chat
  Object.assign(aiChat, {
    __requestId__,
    config: {
      ...providerOptions,
      apiKey: (
        config?.[`${provider}_CREDENTIALS`]?.apiKey || // check for custom credentials in config
        env?.[`${provider}_CREDENTIALS_apiKey`] //use default credentials from env
      )
    }
  });

  // 7.2. Execute AI Chat
  const { prompt, answer, tokens } = await aiChat(
    { instructions, messages: chatLogs },
    options?.streamResponse ? res.stream : (() => { })
  );

  // 8. Return Response
  return {
    message,
    prompt,
    answer,
    consumption: {
      type: 'tokens',
      value: tokens
    }
  };
};

export default chatAgent;


const promptTemplate = `
{{copilotPrompt}}
================
{{instructions}}
{{currentDatePrompt}}
================
`;


const copilotPromptTemplate = `
## YOUR IDENTITY
Your name is {{name}}. Here's your backstory:
<backstory>
{{backstory}}
{{job}}
</backstory>
`;

const currentDatePromptTemplate = `
Current Date Time:
<currentDate>
{{currentDate}}
</currentDate>
`;

// TO DO: ADD HABILITY TO HANDLE COMMANDS

// 2. Ececute Commands
// const commandsList = {
//   '#limparconversa': async (payload) => {
//     await chatLogs.reject();
//     return
//   },
// };
// const commands = [];
// const matches = textMessage.match(/\#[^\s:]*(?:\:[^,\s]*(?:,\s*[^,\s]*)*)?/g)
// const executions = [];
// if (matches) {
//   matches.forEach(command => {
//     let [action, params] = command.split(':');
//     params = params ? params.split(',') : [];
//     commands.push({ action, params });
//   })
//   commands.forEach(({ action, params }) => {
//     const command = commandsList[action];
//     if (command) {
//       const execution = command({ params });
//       executions.push(execution);
//     }
//   })
//   if (executions.length > 0) {
//     await Promise.all(executions)
//     return callback({
//       user,
//       thread,
//       message: 'OK',
//       cost: 0,
//     })
//   }
// }