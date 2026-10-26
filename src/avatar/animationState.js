import * as THREE from 'three';
import { state } from '../state.js';
import { loadVrmaClip } from './animationLoader.js';
import { setCameraMode } from '../core/cameraRig.js';
import { detachActivePose } from './poseScheduler.js';

export function initAnimationSystem(vrm) {
  state.mixer = new THREE.AnimationMixer(vrm.scene);

  state.activeGesture = null;

  setupGestureFinishedListener();
  loadIdleAnimation(vrm);
}

function loadIdleAnimation(vrm) {
  loadVrmaClip('./assets/idle-full.vrma', vrm, (action) => {
    state.animations.full.idle = action;
    if (state.currentMode === 'full') action.play();
  }, undefined, THREE.LoopRepeat);

  loadVrmaClip('./assets/idle-half.vrma', vrm, (action) => {
    state.animations.half.idle = action;
  }, undefined, THREE.LoopRepeat);

  [1, 2, 3, 4].forEach((n) => {
    loadVrmaClip(`./assets/gesture-${n}.vrma`, vrm, (action) => {
      action.clampWhenFinished = true;

      action.userData = { isGesture: true };

      state.gestureActions[n] = action;
    }, undefined, THREE.LoopOnce);
  });
}

function currentSlot() {
  return state.animations[state.currentMode];
}

export function playGesture(n) {
  const gesture = state.gestureActions[n];
  const idle = currentSlot().idle;
  if (!gesture || !idle) return;
  const poseFrom = detachActivePose();
  if (!poseFrom && !idle.isRunning()) {
    idle.reset().play();
  }
  const from = poseFrom ?? (state.activeGesture?.isRunning() ? state.activeGesture : idle);
  gesture.reset().play();
  gesture.crossFadeFrom(from, 0.2, false);
  state.activeGesture = gesture;
}

function setupGestureFinishedListener() {
  state.mixer.addEventListener('finished', (e) => {
    // 🔧 PERUBAHAN #4: cek via userData (O(1)) alih-alih Object.values (O(n))
    if (!e.action.userData?.isGesture) return;
    state.activeGesture = null;
    const idle = currentSlot().idle;
    if (idle) {
      idle.reset();
      idle.play();
      const fadeDuration = Math.min(0.2, e.action.getClip().duration);
      idle.crossFadeFrom(e.action, fadeDuration, false);
    }
  });
}

export function playTalkingAnimation() {
  state.isTalking = true;
}

export function playIdleAnimation() {
  state.isTalking = false;
}

export function switchMode(newMode) {
  if (newMode === state.currentMode) return;
  Object.values(state.gestureActions).forEach((g) => {
    if (g?.isRunning()) g.stop();
  });
  state.activeGesture = null;
  const oldAction = detachActivePose() ?? currentSlot().idle;
  state.currentMode = newMode;
  const newAction = currentSlot().idle;

  if (oldAction && newAction) {
    newAction.reset();
    newAction.paused = false;
    newAction.enabled = true;
    newAction.play();
    newAction.crossFadeFrom(oldAction, 0.3, false);
  } else if (newAction) {
    newAction.reset();
    newAction.play();
  }

  setCameraMode(newMode);
}