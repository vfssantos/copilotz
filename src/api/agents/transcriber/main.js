// Convert base64 audio to Blob
const base64ToBlob = (base64) => {
  const [mimeTypeHeader, base64Data] = base64.split(',');
  const mimeType = mimeTypeHeader.match(/:(.*?);/)[1];

  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};


const transcriberAgent = async ({ instructions, audio }, res) => {

  console.log(`[transcriberAgent] Starting transcriber agent`);

  const { modules, resources, env, __requestId__ } = transcriberAgent;

  const { ai } = modules;

  const { config } = resources;

  if (!audio) return;

  console.log(`[chatAgent] Audio input detected, starting transcription`);
  const provider = config?.AI_CHAT_PROVIDER?.provider;
  const transcriber = ai['speechToText'][provider];
  Object.assign(transcriber, {
    __requestId__,
    config: {
      apiKey: (
        config?.[`${provider}_CREDENTIALS`]?.apiKey || // check for custom credentials in config
        env?.[`${provider}_CREDENTIALS_apiKey`] //use default credentials from env
      )
    }
  });

  const audioBlob = base64ToBlob(audio);

  const transcribedAudio = await transcriber({
    blob: audioBlob,
    instructions
  });

  console.log(`[transcriberAgent] Transcribed audio with ${transcribedAudio.duration} hours`);

  const transcribedText = `Transcript:\n\n"""\n${transcribedAudio.text}\n"""\n\n`

  return transcribedText;

}

export default transcriberAgent;
