import { state } from '../state.js';
import {
  setupLipSync,
  teardownLipSync,
  resumeAudioContext,
} from '../avatar/lipsync.js';
import { setFacialExpression } from '../avatar/expressions.js';
import { dispatchActions } from '../avatar/actionDispatcher.js';
import { prefetchPoses } from '../avatar/poseLibrary.js';
import { startPoseSession, endPoseSession } from '../avatar/poseScheduler.js';
import {
  startExpressionSession,
  endExpressionSession,
} from '../avatar/expressionScheduler.js';
import {
  playTalkingAnimation,
  playIdleAnimation,
} from '../avatar/animationState.js';
import { startSpeechBubble, endSpeechBubble } from '../ui/speechBubble.js';

let currentAudio = null;

export async function playReply(result) {
  state.awaitingConfirmation = Boolean(result.awaitingConfirmation);
  await resumeAudioContext();

  // Muat file pose yang dipakai balasan ini SEBELUM audio mulai, supaya pose
  // pertama tidak telat muncul (setelah pertama kali, pose sudah ada di cache).
  await prefetchPoses(
    (result.actions ?? []).filter((a) => a.name === 'play_pose').map((a) => a.args?.pose)
  );

  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.src = '';
    } catch (_) { /* ignore */ }
    teardownLipSync();
    currentAudio = null;
  }

  const mimeType = result.audioMimeType || 'audio/mpeg';
  const replyAudio = new Audio(`data:${mimeType};base64,${result.audioBase64}`);
  currentAudio = replyAudio;

  setupLipSync(replyAudio);

  startPoseSession(replyAudio, result.actions);

  startExpressionSession(replyAudio, result.actions);

  startSpeechBubble(replyAudio, result);

  dispatchActions(result.actions);

  const hasExpression = result.actions?.some(a => a.name === 'set_expression');
  if (!hasExpression) {
    setFacialExpression('neutral');
  }

  // Mulai bicara
  playTalkingAnimation();
  state.lipSyncActive = true;

  const end = () => {
    if (currentAudio !== replyAudio) return;  
    playIdleAnimation();
    endPoseSession(replyAudio);
    endExpressionSession(replyAudio);
    endSpeechBubble(replyAudio);
    state.lipSyncActive = false;
    setFacialExpression('neutral');
    teardownLipSync();
    currentAudio = null;
  };

  replyAudio.onended = end;
  replyAudio.onerror = end;

  try {
    await replyAudio.play();
  } catch (err) {
    console.warn('[playReply] Gagal play:', err);
    end();
  }
}