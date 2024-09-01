

const chatAgent = async ({ instructions, input, user, thread, content }, res) => {

  // Extract Resources
  const { __tags__, __executionId__, modules, resources, utils } = chatAgent;

  // Extract Utils
  const { createPrompt } = utils;

  // Extract Dependencies
  const { models, ai, callback } = modules;

  // Extract Resources
  const { copilotz, config } = resources;

  // Extract params
  // 1. Get Thread and Turn Ids;
  if (__tags__ && !__tags__?.turnId) __tags__.turnId = __executionId__;
  const { extId: threadId } = thread;

  // 2. Get Input
  if (!input) {
    const { text, audio } = content;
    const inputArr = [text];

    // 2.1. Transcribe Audio input to text
    if (audio) {
      const textFromAudio = await ai["speech-to-text"]?.({
        blob: audio,
      });
      inputArr.push(textFromAudio);
    }
    input = inputArr.filter(Boolean).join("/n");
  }

  const message = input && {
    role: "user",
    content: input,
  }

  // // 3. Get Chat Logs
  // const logs = await models.log.find({ tags: { threadId: threadId }, executionId: __tags__?.turnId });
  const chatLogs = [];
  const logs = await models.logs.find({
    name: "chaAgent", input: {
      $in: '$thread: { extId: threadId } } } });
  // if (logs.length) {
  //   const mainInstance = logs.find(log => log?.executionId === __tags__?.turnId)?.instance
  //   const historyLogs = await models.log.find({ _unsafe: { hidden: { $ne: true } }, tags: { threadId: threadId }, instance: { _id: mainInstance._id } }, { sort: { createdAt: 1 } });
  //   historyLogs?.forEach(log => {
  //     log?.output?.message && chatLogs.push(log?.output?.message);
  //     log?.output?.answer && !log?.output?.answer?.error && chatLogs.push({ role: 'assistant', content: typeof log?.output?.answer === 'string' ? log?.output?.answer : JSON.stringify(log?.output?.answer) });
  //     log?.output?.answer?.error && chatLogs.push({
  //       role: "assistant", content: JSON.stringify({ ...log?.output?.answer, reason: 'Oops. I made a mistake in my previous message as shown in the "error" property.  I\'ll fix it next.', })
  //     });
  //   });
  // }

  message && chatLogs.push(message);

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

  instructions = createPrompt(promptTemplate, promptVariables)

  const { provider, ...options } = config.AI_CHAT_PROVIDER;
    const aiChat = ai.chat[provider || 'openai'];

    Object.assign(aiChat, {
      config: {
        ...options,
        apiKey: config?.[`${provider}_CREDENTIALS`]?.apiKey
      }
    });

    const { prompt, answer, tokens } = await aiChat(
      { instructions, messages: chatLogs }, res.stream,
    );

    console.log({ prompt, answer, tokens })

  // callback && callback({ user, thread, message: answer }, res);

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

