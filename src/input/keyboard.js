import { state } from '../state.js';
import { switchMode, playGesture } from '../avatar/animationState.js';
import { toggleRecording, stopRecording } from '../audio/recorder.js';
import { playReply } from '../audio/playback.js';

export function initKeyboard() {
  // M = toggle mode full/half
  // R = toggle rekam
  // 1/2/3 = gestur
  // +/- = resize window
  // Esc = keluar
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;

    switch (e.key.toLowerCase()) {
      case 'm':
        switchMode(state.currentMode === 'full' ? 'half' : 'full');
        break;
      case 'r':
        toggleRecording(playReply);
        break;
      case '1':
      case '2':
      case '3':
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