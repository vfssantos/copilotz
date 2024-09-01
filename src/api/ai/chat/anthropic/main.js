import formatChat, { tokenCounter } from '../helpers.js';

export default ({ config, env, ...rest }) => {
    return async (chat, stream = () => { }) => {

        const [systemPrompt, ...messages] = formatChat({ ...chat, config });

        // call the openai api
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": `${config.apiKey}`,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                messages,
                model: config.model || "claude-3-haiku-20240307",
                stream: true,
                temperature: config.temperature || 0,
                system: systemPrompt.content,
                // response_format: config.responseType === "json"
                //     ? { type: "json_object" }
                //     : undefined, ==> response format does not work in claude
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
                    const delta = data?.delta?.text;
                    // if there's a delta, then stream it
                    if (delta) {
                        stream(delta);
                        text = text + delta;
                    }
                }
            });

            // if it's done, then stop reading
            if (done) {
                resolver.resolve({ prompt: messages, answer: text, tokens: tokenCounter(messages, text) });
                return;
            }

            // Read some more, and call this function again
            return reader.read().then(processText);
        });
        return await resolved;
    };
};
