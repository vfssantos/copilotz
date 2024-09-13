const openAiSpeechToText = async ({ blob } = {}) => {
  const { config, env } = openAiSpeechToText;
  if (!blob) return
  // Prepare FormData with audio content
  blob = await blob;
  console.log('blob', blob)
  const formData = new FormData();
  formData.append("file", blob);
  formData.append("model", config.model || 'whisper-1');
  formData.append("language", config.language || 'pt');
  formData.append("response_format", 'verbose_json')

  // Call Whisper API
  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey || env.OPENAI_API_KEY}`,
      },
      body: formData,
    },
  );

  const json = await response.json();

  return {
    text: json?.text,
    duration: (json?.duration) / (60 * 60),
    error: json?.error,
  }
};

export default openAiSpeechToText;
