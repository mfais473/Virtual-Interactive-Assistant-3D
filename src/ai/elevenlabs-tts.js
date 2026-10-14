const ELEVENLABS_TTS_API_KEY = process.env.ELEVENLABS_TTS_API_KEY;
const ELEVENLABS_TTS_VOICE_ID = process.env.ELEVENLABS_TTS_VOICE_ID;
const ELEVENLABS_TTS_MODEL =
  process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2';

const BASE_URL = 'https://api.elevenlabs.io/v1';

if (!ELEVENLABS_TTS_API_KEY) {
  console.warn('[elevenlabs-tts] ELEVENLABS_TTS_API_KEY tidak diset.');
}
if (!ELEVENLABS_TTS_VOICE_ID) {
  console.warn('[elevenlabs-tts] ELEVENLABS_TTS_VOICE_ID tidak diset.');
}

/**
 * Konversi teks menjadi audio menggunakan ElevenLabs TTS.
 *
 * @param {string} text - Teks yang akan diucapkan.
 * @param {object} [options]
 * @param {string} [options.voiceId] - Override voice ID.
 * @param {string} [options.modelId] - Override model ID.
 * @param {object} [options.voiceSettings] - Override voice settings.
 * @param {string} [options.outputFormat='mp3_44100_128'] - Format output.
 * @returns {Promise<{ audioBase64: string, mimeType: string }>}
 */
async function synthesizeSpeech(text, options = {}) {
  if (!text || typeof text !== 'string') {
    throw new Error('[elevenlabs-tts] text harus berupa string non-kosong.');
  }

  const voiceId = options.voiceId || ELEVENLABS_TTS_VOICE_ID;
  const modelId = options.modelId || ELEVENLABS_TTS_MODEL;
  const outputFormat = options.outputFormat || 'mp3_44100_128';

  const voiceSettings = options.voiceSettings || {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true,
  };

  const url = `${BASE_URL}/text-to-speech/${voiceId}?output_format=${outputFormat}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_TTS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: voiceSettings,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `[elevenlabs-tts] Gagal synthesize (${response.status}): ${errText}`
    );
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const audioBase64 = audioBuffer.toString('base64');

  // Map output_format → mimeType untuk renderer
  const mimeType = outputFormat.startsWith('mp3')
    ? 'audio/mpeg'
    : outputFormat.startsWith('pcm')
    ? 'audio/wav'
    : 'audio/mpeg';

  return { audioBase64, mimeType };
}

/**
 * Versi streaming (opsional, untuk latensi rendah).
 * Mengembalikan ReadableStream dari ElevenLabs.
 */
async function synthesizeSpeechStream(text, options = {}) {
  const voiceId = options.voiceId || ELEVENLABS_TTS_VOICE_ID;
  const modelId = options.modelId || ELEVENLABS_TTS_MODEL;

  const url = `${BASE_URL}/text-to-speech/${voiceId}/stream`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_TTS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: options.voiceSettings || {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `[elevenlabs-tts] Gagal stream (${response.status}): ${errText}`
    );
  }

  return response.body; // ReadableStream
}

module.exports = { synthesizeSpeech, synthesizeSpeechStream };