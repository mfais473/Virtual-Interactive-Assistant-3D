const { ipcMain, app } = require('electron');
const { genAI } = require('../ai/gemini-client');
const { SYSTEM_PROMPT } = require('../ai/prompt-builder');
const { parseActions } = require('../parser/tag-parser');
const { checkGestureEmotionConsistency } = require('../validators/gesture-consistency');
const { resizeWindow } = require('./window');
const { executeToolActions } = require('../tools');
const { transcribeAudio, base64ToBuffer } = require('../ai/elevenlabs-stt');
const { synthesizeSpeech } = require('../ai/elevenlabs-tts');

function mergeActions(original, parsed) {
  for (const a of parsed) {
    if (a.name === 'set_expression') {
      const idx = original.findIndex((x) => x.name === 'set_expression');
      if (idx >= 0) original[idx] = a;
      else original.push(a);
    } else {
      original.push(a);
    }
  }
  return original;
}

function registerIpcHandlers() {
  ipcMain.on('app-quit', () => app.quit());
  ipcMain.on('resize-window', (event, direction) => resizeWindow(direction));

  ipcMain.handle('process-turn', async (event, { audioBase64, mimeType }) => {
    try {
      // ─────────────────────────────────────────────
      // 1) STT: Audio → Teks (ElevenLabs Scribe)
      // ─────────────────────────────────────────────
      const audioBuffer = base64ToBuffer(audioBase64);
      const sttResult = await transcribeAudio(audioBuffer, {
        fileName: 'user-input.wav',
        mimeType: mimeType || 'audio/wav',
        languageCode: 'ind', // sesuaikan
      });
      const userText = sttResult.text.trim();

      if (!userText) {
        console.warn('[process-turn] STT menghasilkan teks kosong.');
      }

      // ─────────────────────────────────────────────
      // 2) Gemini #1: Teks → Teks + Actions
      //    (Input sekarang TEKS, bukan audio — hemat token!)
      // ─────────────────────────────────────────────
      const understandResponse = await genAI.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: [{ parts: [{ text: userText }] }], // 👈 teks saja
        config: { systemInstruction: SYSTEM_PROMPT },
      });
      const rawReplyText = understandResponse.text;

      const { actions, cleanText } = parseActions(rawReplyText);
      checkGestureEmotionConsistency(actions);

      // ─────────────────────────────────────────────
      // 3) Eksekusi tool
      // ─────────────────────────────────────────────
      const toolResults = await executeToolActions(actions);

      const imageResults = toolResults.filter((r) => r.success && r.imageBase64);
      const textResults  = toolResults.filter((r) => r.success && r.text);
      const errorResults = toolResults.filter((r) => !r.success);
      const otherResults = toolResults.filter(
        (r) => r.success && !r.imageBase64 && !r.text
      );

      const hasAnyResult =
        imageResults.length > 0 ||
        textResults.length > 0 ||
        errorResults.length > 0 ||
        otherResults.length > 0;

      let finalText = cleanText;

      // ─────────────────────────────────────────────
      // 4) Gemini #2: Follow-up (jika ada hasil tool)
      // ─────────────────────────────────────────────
      if (hasAnyResult) {
        const parts = [];

        for (const img of imageResults) {
          parts.push({
            inlineData: { mimeType: img.imageMimeType, data: img.imageBase64 },
          });
        }
        for (const t of textResults) {
          parts.push({ text: `Isi file "${t.path}":\n\n${t.text}` });
        }
        for (const e of errorResults) {
          parts.push({ text: `Tool gagal dijalankan: ${e.error}` });
        }
        for (const o of otherResults) {
          parts.push({ text: `Hasil tool: ${o.message || JSON.stringify(o)}` });
        }

        parts.push({
          text:
            'Itu hasil tool yang baru dipanggil. Beri tahu pengguna secara singkat ' +
            'dalam Bahasa Indonesia. Kalau tool gagal atau dibatalkan pengguna, ' +
            'sampaikan dengan sopan. Kalau ada isi file, ringkas atau jawab ' +
            'berdasarkan isinya. Mulai dengan satu tag emosi saja.',
        });

        const followUp = await genAI.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: [{ parts }],
          config: { systemInstruction: SYSTEM_PROMPT },
        });

        const parsed = parseActions(followUp.text);
        finalText = parsed.cleanText;
        mergeActions(actions, parsed.actions);
      }

      // ─────────────────────────────────────────────
      // 5) TTS: Teks → Audio (ElevenLabs)
      // ─────────────────────────────────────────────
      const { audioBase64: ttsAudioBase64, mimeType: ttsMimeType } =
        await synthesizeSpeech(finalText, {
          // voiceId: 'xxx',  // override kalau perlu
        });

      return {
        text: finalText,
        userText,                       // ✨ bonus: transkrip user (berguna untuk history)
        audioBase64: ttsAudioBase64,
        audioMimeType: ttsMimeType,     // ✨ mimeType baru
        actions,
      };
    } catch (error) {
      console.error('Error saat memproses turn:', error);
      throw error;
    }
  });
}

module.exports = { registerIpcHandlers };