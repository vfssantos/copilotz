// Convert base64 audio to Blob
const base64ToBlob = (base64) => {
  if (typeof base64 !== 'string') {
    console.error('[base64ToBlob] Input is not a string:', base64);
    throw new Error('Invalid base64 input: expected string');
  }

  const parts = base64.split(',');
  if (parts.length !== 2) {
    console.error('[base64ToBlob] Invalid base64 format:', base64.substring(0, 50) + '...');
    throw new Error('Invalid base64 format: expected "data:mimetype;base64,<data>"');
  }

  const [mimeTypeHeader, base64Data] = parts;
  // ... rest of the function remains the same
};

const transcriberAgent = async ({ instructions, audio }, res) => {
  try {
    // ... existing code ...

    if (!audio) {
      console.error('[transcriberAgent] No audio input provided');
      throw new Error('No audio input provided');
    }

    console.log(`[transcriberAgent] Audio input detected, starting transcription`);
    console.log(`[transcriberAgent] Audio input type:`, typeof audio);
    console.log(`[transcriberAgent] Audio input preview:`, audio.substring(0, 50) + '...');

    const audioBlob = base64ToBlob(audio);

    // ... rest of the function remains the same
  } catch (err) {
    console.error(`[transcriberAgent] Error transcribing audio:`, err);
    throw { message: `Error transcribing audio: ${err.message}`, status: err.status || 500 };
  }
};