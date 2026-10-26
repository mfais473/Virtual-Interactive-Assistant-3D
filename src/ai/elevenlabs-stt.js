const ELEVENLABS_STT_API_KEY = process.env.ELEVENLABS_STT_API_KEY;
const ELEVENLABS_STT_MODEL = process.env.ELEVENLABS_STT_MODEL || 'scribe_v1';

const BASE_URL = 'https://api.elevenlabs.io/v1';

if (!ELEVENLABS_STT_API_KEY) {
  console.warn('[elevenlabs-stt] ELEVENLABS_STT_API_KEY tidak diset.');
}

/**
 * Transkripsi audio menjadi teks menggunakan ElevenLabs Scribe.
 *
 * @param {Buffer|Uint8Array} audioBuffer - Buffer audio (wav/mp3/m4a/webm).
 * @param {object} [options]
 * @param {string} [options.fileName='audio.wav'] - Nama file (untuk deteksi format).
 * @param {string} [options.mimeType] - MIME type audio.
 * @param {string} [options.languageCode] - Kode bahasa (mis. 'ind' untuk Indonesia).
 * @param {boolean} [options.diarize=false] - Aktifkan speaker diarization.
 * @param {number} [options.tagAudioEvents] - Tag audio events.
 * @returns {Promise<{ text: string, language: string, raw: object }>}
 */
async function transcribeAudio(audioBuffer, options = {}) {
  if (!audioBuffer) {
    throw new Error('[elevenlabs-stt] audioBuffer wajib diisi.');
  }

  const fileName = options.fileName || 'audio.wav';
  const mimeType = options.mimeType || 'audio/wav';

  // Buat FormData untuk multipart upload
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  formData.append('file', blob, fileName);
  formData.append('model_id', ELEVENLABS_STT_MODEL);

  if (options.languageCode) {
    formData.append('language_code', options.languageCode);
  }
  if (options.diarize) {
    formData.append('diarize', 'true');
  }
  if (typeof options.tagAudioEvents === 'number') {
    formData.append('tag_audio_events', String(options.tagAudioEvents));
  }

  const url = `${BASE_URL}/speech-to-text`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_STT_API_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `[elevenlabs-stt] Gagal transkripsi (${response.status}): ${errText}`
    );
  }

  const data = await response.json();

  return {
    text: data.text || '',
    language: data.language_code || data.language || '',
    raw: data,
  };
}

/**
 * Helper: konversi base64 → Buffer.
 */
function base64ToBuffer(base64) {
  return Buffer.from(base64, 'base64');
}

module.exports = { transcribeAudio, base64ToBuffer };