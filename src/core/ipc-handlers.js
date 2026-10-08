const { ipcMain, app } = require('electron');
const { genAI } = require('../ai/gemini-client');
const { SYSTEM_PROMPT } = require('../ai/prompt-builder');
const { parseActions } = require('../parser/tag-parser');
const { checkGestureEmotionConsistency } = require('../validators/gesture-consistency');
const { pcmToWavBase64 } = require('../audio/pcm-to-wav');
const { resizeWindow } = require('./window');
const { executeToolActions } = require('../tools');

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
  ipcMain.on('app-quit', () => {
    app.quit();
  });

  ipcMain.on('resize-window', (event, direction) => {
    resizeWindow(direction);
  });

  ipcMain.handle('process-turn', async (event, { audioBase64, mimeType }) => {
    try {
      // 1) Audio → teks + tag actions
      const understandResponse = await genAI.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [{ inlineData: { mimeType, data: audioBase64 } }],
        config: { systemInstruction: SYSTEM_PROMPT },
      });
      const rawReplyText = understandResponse.text;

      const { actions, cleanText } = parseActions(rawReplyText);
      checkGestureEmotionConsistency(actions);

      // 2) Jalankan tool
      const toolResults = await executeToolActions(actions);

      // 3) Klasifikasi hasil tool
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

      // 4) Kalau ada hasil tool, panggil Gemini kedua untuk komentar/analisis
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

      // 5) TTS
      const ttsResponse = await genAI.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text: finalText }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
          },
        },
      });

      const rawAudioBase64 = ttsResponse.candidates[0].content.parts[0].inlineData.data;
      const wavAudioBase64 = pcmToWavBase64(rawAudioBase64);

      return {
        text: finalText,
        audioBase64: wavAudioBase64,
        actions,
      };
    } catch (error) {
      console.error('Terjadi error saat memproses audio di Gemini:', error);
      throw error;
    }
  });
}

module.exports = { registerIpcHandlers };