const { ipcMain, app } = require('electron');
const { parseActions } = require('../parser/tag-parser');
const { resizeWindow } = require('./window');
const { transcribeAudio, base64ToBuffer } = require('../ai/elevenlabs-stt');
const { synthesizeSpeech } = require('../ai/elevenlabs-tts');
const { appendTurn } = require('../ai/conversation-memory');
const agent = require('../agent/agent-loop');
const { shortcutDecision } = require('../agent/confirmation');

function fileNameFromMime(mimeType) {
  const m = (mimeType || '').toLowerCase();
  if (m.includes('webm')) return 'user-input.webm';
  if (m.includes('ogg')) return 'user-input.ogg';
  if (m.includes('mpeg') || m.includes('mp3')) return 'user-input.mp3';
  if (m.includes('mp4') || m.includes('m4a')) return 'user-input.m4a';
  return 'user-input.wav';
}

let busy = false;

function registerIpcHandlers() {
  ipcMain.on('app-quit', () => app.quit());
  ipcMain.on('resize-window', (event, direction) => resizeWindow(direction));
  async function finishOutcome(outcome, userText) {
    const { actions, cleanText } = parseActions(outcome.rawText || '');
    if (!cleanText || !cleanText.trim()) {
      console.warn('[process-turn] Balasan kosong, TTS dilewati.');
      return null;
    }
    const { audioBase64: ttsAudioBase64, mimeType: ttsMimeType } =
      await synthesizeSpeech(cleanText, {});
    if (outcome.done) appendTurn(outcome.userText, cleanText);
    return {
      text: cleanText,
      userText,
      audioBase64: ttsAudioBase64,
      audioMimeType: ttsMimeType,
      actions,
      awaitingConfirmation: !outcome.done,
    };
  }
  ipcMain.handle('process-turn', async (event, { audioBase64, mimeType }) => {
    if (busy) {
      console.warn('[process-turn] Masih memproses turn sebelumnya, input diabaikan.');
      return null;
    }
    busy = true;
    try {
      const sttResult = await transcribeAudio(base64ToBuffer(audioBase64), {
        fileName: fileNameFromMime(mimeType),
        mimeType: mimeType || 'audio/wav',
        languageCode: 'ind',
      });
      const userText = sttResult.text.trim();
      if (!userText) {
        console.warn('[process-turn] STT menghasilkan teks kosong, turn dilewati.');
        return null;
      }
      const outcome = agent.hasPending()
        ? await agent.resume(userText)
        : await agent.startTurn(userText);
      return await finishOutcome(outcome, userText);
    } catch (error) {
      agent.cancelPending();
      console.error('Error saat memproses turn:', error);
      throw error;
    } finally {
      busy = false;
    }
  });
  ipcMain.handle('confirm-shortcut', async (event, payload) => {
    const parsed = shortcutDecision(payload);
    if (!parsed) return { noPending: true };       
    if (busy) return null;
    if (!agent.hasPending()) return { noPending: true };
    busy = true;
    try {
      const outcome = await agent.answerPending(parsed.decision);
      if (!outcome) return { noPending: true };
      return await finishOutcome(outcome, parsed.label);
    } catch (error) {
      agent.cancelPending();
      console.error('Error saat memproses shortcut izin:', error);
      throw error;
    } finally {
      busy = false;
    }
  });
}

module.exports = { registerIpcHandlers };