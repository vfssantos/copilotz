const formatChat = ({ input, categories, currentIndex, instructions }) => {
    const messages = [
        {
            role: "user",
            content: `<message>\n${input}\n</message>\n<categories/>\n${JSON.stringify(categories)}\n</categories>\n${categories[currentIndex] ? `<currentCategory>${categories[currentIndex]}<currentCategory>` : ''
                }` + (instructions || '')
        },
    ];

    return {
        instructions:
            `Classify the message in user input into the categories' description provided. Return the category index from the categories array (starts with 0). Answer with the number, only.\n- Wildcards can match anything;\n- If no matches are found, answer with  <currentCategory/> (if available).`,
        messages
    }
}

export default ({ config, adapters, resources }) => {

    return async function intentClassificaiton({ input, categories, currentIndex, instructions, __requestId__ }, res) {
        const { ai } = adapters;
        const chat = formatChat({ input, categories, currentIndex, instructions });
        const data = await ai.chat(chat)
        let index = parseInt(data.answer);
        if (index > categories.length - 1) {
            index = categories.length - 1
        }
        if (isNaN(index)) {
            return intentClassificaiton({ input, categories, currentIndex, instructions, __requestId__ }, res)
        }
        return index // Returns the category index
    }
}