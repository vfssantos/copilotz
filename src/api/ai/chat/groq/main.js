import formatChat, { tokenCounter } from '../helpers.js';

export default function groqChat({ config, env, ...rest }) {
  return async (chat, stream = () => { }) => {

    const messages = formatChat({ ...chat, config });

    // call the openai api
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        messages,
        model: config.model || "llama3-8b-8192",
        stream: true,
        temperature: config.temperature || 0,
        response_format: config.responseType === "json"
          ? { type: "json_object" }
          : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    // create a reader to read the stream
    const reader = response?.body?.getReader();

    let resolver;

    const resolved = new Promise((resolve, reject) => {
      resolver = { resolve, reject };
    });
    let text = "";

    reader?.read()?.then(function processText({ done, value }) {
      // value for fetch streams is a Uint8Array
      const chunk = new TextDecoder("utf-8").decode(value);

      // split the chunk into lines
      chunk.split("\n").forEach((line) => {
        if (line.startsWith("data:")) {
          let data;
          try {
            // parse the json
            data = JSON.parse(line.slice(5).trim());
          } catch (e) {
            "";
          }
          // get the delta from the json
          const delta = data?.choices?.[0]?.delta?.content;
          // if there's a delta, then stream it
          if (delta) {
            stream(delta);
            text = text + delta;
          }
        }
      });

      // if it's done, then stop reading
      if (done) {
        console.log('AI RESPONSE DONE', { prompt: messages, answer: text, tokens: tokenCounter(messages, text) })
        resolver.resolve({ prompt: messages, answer: text, tokens: tokenCounter(messages, text) });
        return;
      }

      // Read some more, and call this function again
      return reader.read().then(processText);
    });
    return await resolved;
  };
};
