import { getEncoding } from "npm:js-tiktoken";

export default ({ instructions, messages, config }) => {

    // create a list of messages to send to the api
    messages = [ // add Assistant initial instructions if they exist
        ...(instructions
            ? [{
                role: "system",
                content: instructions,
            }]
            : []),
        ...messages
    ];

    // limit the length of the messages to config.maxLength
    if (config.maxLength) {
        messages = concatenateMessages(
            messages,
            config.maxLength - (instructions?.length || 0),
        );
    }

    messages = [
        ...(instructions && messages[0]?.role !== "system"
            ? [{
                role: "system",
                content: instructions,
            }]
            : []),
        ...messages,
    ];

    return messages
}

function concatenateMessages(messages, limit) {
    let concatenatedMessages = [];
    let concatenatedCharacters = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
        const currentMessage = messages[i];
        if (!currentMessage.content) continue;

        if (concatenatedCharacters + currentMessage.content.length <= limit) {
            concatenatedMessages = [currentMessage, ...concatenatedMessages];
            concatenatedCharacters += currentMessage.content.length;
        } else {
            const remainingCharacters = limit - concatenatedCharacters;
            concatenatedMessages = [{
                ...currentMessage,
                content: currentMessage.content.slice(-remainingCharacters),
            }, ...concatenatedMessages];
            concatenatedCharacters = limit;
            break;
        }
    }

    return concatenatedMessages;
}

export const tokenCounter = (prompt, answer) => {
    const encoding = getEncoding("cl100k_base");
    const encoded = encoding.encode(prompt.map(i => i.content).join(' ') + answer);
    const tokensCount = encoded.length;
    return tokensCount;
}
