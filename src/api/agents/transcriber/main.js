
export default ({ config, adapters, resources }) => {

    const { ai, callback } = adapters;

    return async ({ user: userData, thread, content, input, __executionId__, self, ...rest }, res) => {
        let duration = 0;
        // 1. Get Input
        if (!input) {
            const { audio, text } = content;
            const inputArr = [text];

            // 1. Get Thread Id and Input message
            if (audio) {
                const audioContent = await ai["speech-to-text"]?.({
                    blob: audio,
                });
                const textFromAudio = audioContent.text;
                duration = audioContent.duration;
                inputArr.push(textFromAudio);
            }
            input = inputArr.filter(Boolean).join("/n");
        }
        config.callbackTranscription && callback && callback({ user: userData, thread, message: input }, res);
        return {
            input,
            consumption: {
                'type': 'audio',
                'value': duration
            }
        }
    };
}
