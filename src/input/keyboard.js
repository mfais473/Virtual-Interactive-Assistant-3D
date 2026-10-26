import { state } from '../state.js';
import { switchMode, playGesture } from '../avatar/animationState.js';
import { toggleRecording, stopRecording } from '../audio/recorder.js';
import { playReply } from '../audio/playback.js';
import { showThinking, hideBubble } from '../ui/speechBubble.js';

async function answerConfirmation(decision) {
  if (!state.awaitingConfirmation || state.confirmShortcutBusy || state.isRecording) return;
  state.confirmShortcutBusy = true;
  showThinking();                              
  try {
    const result = await window.api.confirmShortcut(decision);
    if (!result) {                             
      hideBubble();
      return;
    }
    if (result.noPending) {                    
      state.awaitingConfirmation = false;
      hideBubble();
      return;
    }
    await playReply(result);
  } catch (err) {
    console.error('Gagal memproses shortcut izin:', err.message);
    hideBubble();
  } finally {
    state.confirmShortcutBusy = false;
  }
}

export function initKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat || !e.isTrusted) return;
    switch (e.key.toLowerCase()) {
      case 'm':
        switchMode(state.currentMode === 'full' ? 'half' : 'full');
        break;
      case 'r':
        toggleRecording(playReply);
        break;
      case 'y':
      case 'n':
      case 't':
        if (e.ctrlKey || e.altKey || e.metaKey) break;
        answerConfirmation({ y: 'approve', n: 'deny', t: 'ask' }[e.key.toLowerCase()]);
        break;
      case '1':
      case '2':
      case '3':
      case '4':
        playGesture(Number(e.key));
        break;
      case '+':
      case '=':
        window.api.resizeWindow('in');
        break;
      case '-':
      case '_':
        window.api.resizeWindow('out');
        break;
      case 'escape':
        window.api.quitApp();
        break;
    }
  });
  window.addEventListener('blur', () => {
    if (state.isRecording) stopRecording();
  });
}