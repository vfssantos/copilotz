const openAiSembeddings = async (input) => {
  // Prepare FormData with audio content
  const { config, env } = openAiSembeddings;

  // Call Embedding API
  const response = await fetch(
    "https://api.openai.com/v1/embeddings",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey || env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model || "text-embedding-3-small",
        input,
      }),
    },
  );

  if (response.status !== 200) {
    return
  }

  const json = await response.json();

  return json?.data?.[0]?.embedding;
};

export default openAiSembeddings;