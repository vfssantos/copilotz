import lodash from "npm:lodash";

function createPrompt(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, function (match, key) {
    return data[key] || '';
  });
}

const mentionsExtractor = ({ input }) => {
  // Regex matches mentions that:
  // - Do not have a word character or dot before them
  // - Start with @ followed by one or more word characters, optionally followed by dots or hyphens
  // - Do not end with a dot, ensuring the mention is properly captured
  const mentionRegex = /(?<![\w.])@\w[\w-]*(?<!\.)/g;

  const mentions = input.match(mentionRegex);

  return mentions;
}


const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getThreadHistory = async (threadId, { functionName, maxRetries, toAppend }) => {

  const { models } = getThreadHistory;

  maxRetries = maxRetries || 10;
  // 1.1 Get Thread Logs
  const threadLogs = [];

  // 1.2. If Last Log Exists, Add to Chat Logs
  const lastLog = (await models.logs.find({
    "name": functionName,
    "input.0.thread.extId": threadId,
    "hidden": null
  }, { sort: { createdAt: -1 }, limit: 5 })).find(log => log.output?.answer);

  // 1.2.1 If first message in previous message's prompt history is System Message
  if (lastLog?.output?.prompt?.[0]?.role === 'system') {
    // 1.2.1.1 Remove system message 
    const _messages = Array.isArray(lastLog?.output?.prompt) ? lastLog?.output?.prompt.slice(1) : [];
    // 1.2.1.2 Add previous message's prompt history to current chatLogs
    threadLogs.push(..._messages);
  } else {
    // 1.2.2.1 Add previous message's prompt history to current chatLogs
    lastLog?.output?.prompt && threadLogs.push(...lastLog?.output?.prompt);
  }
  // 1.2.2 Add Last Message's Answer to current chatLogs
  lastLog?.output?.answer && threadLogs.push({ role: 'assistant', content: lastLog?.output?.answer });

  //let's make sure that  content is a string
  threadLogs.map(log => {
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

  return threadLogs;

}

export default (shared) => {
  Object.assign(getThreadHistory, { models: shared.models })
  return {
    ...shared,
    utils: {
      ...shared?.utils,
      createPrompt,
      getThreadHistory,
      mentionsExtractor,
      sleep,
      _: lodash
    }
  }
}
