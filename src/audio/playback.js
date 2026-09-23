import { state } from '../state.js';
import { setupLipSync } from '../avatar/lipsync.js';
import { setFacialExpression } from '../avatar/expressions.js';
import { dispatchActions } from '../avatar/actionDispatcher.js';
import {
  playTalkingAnimation,
  playIdleAnimation,
} from '../avatar/animationState.js';

export function playReply(result) {
  const replyAudio = new Audio('data:audio/wav;base64,' + result.audioBase64);

  setupLipSync(replyAudio);

  const gestureAction = result.actions?.find((a) => a.name === 'play_gesture');
  const speakStartTime = gestureAction?.args?.speakStartTime ?? 0;

  setFacialExpression('neutral');
  dispatchActions(result.actions);

  const startSpeaking = () => {
    playTalkingAnimation();
    state.lipSyncActive = true;
    replyAudio.play();
  };

  if (speakStartTime > 0) {
    console.log(
      `Gesture dipicu. Bicara mulai dalam ${speakStartTime}s ` +
      `(setelah gestur memperkenalkan diri).`
    );
    setTimeout(startSpeaking, speakStartTime * 1000);
  } else {
    startSpeaking();
  }

  const end = () => {
    playIdleAnimation();
    state.lipSyncActive = false;
    setFacialExpression('neutral');
  };

  replyAudio.onended = end;
  replyAudio.onerror = end;
}