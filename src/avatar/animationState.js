import * as THREE from 'three';
import { state } from '../state.js';
import { loadVrmaClip } from './animationLoader.js';
import { setCameraMode } from '../core/cameraRig.js';

export function initAnimationSystem(vrm) {
  state.mixer = new THREE.AnimationMixer(vrm.scene);
  setupGestureFinishedListener();
  loadIdleAnimation(vrm);
}

function loadIdleAnimation(vrm) {
  loadVrmaClip('./assets/idle-full.vrma', vrm, (action) => {
    state.animations.full.idle = action;
    if (state.currentMode === 'full') action.play();
  }, undefined, THREE.LoopOnce);

  loadVrmaClip('./assets/idle-half.vrma', vrm, (action) => {
    state.animations.half.idle = action;
  }, undefined, THREE.LoopOnce);

  [1, 2, 3].forEach((n) => {
    loadVrmaClip(`./assets/gesture-${n}.vrma`, vrm, (action) => {
      action.clampWhenFinished = true;
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

  gesture.reset().play();
  gesture.crossFadeFrom(idle, 0.2, false);
}

function setupGestureFinishedListener() {
  state.mixer.addEventListener('finished', (e) => {
    const isGestureAction = Object.values(state.gestureActions).includes(e.action);
    if (!isGestureAction) return;

    const idle = currentSlot().idle;
    if (idle) {
      const clipDuration = idle.getClip().duration;
      idle.enabled = true;
      idle.paused = false;
      idle.time = Math.max(0, clipDuration - 0.05);
      idle.crossFadeFrom(e.action, 0.9, false);
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

  const oldAction = currentSlot().idle;
  state.currentMode = newMode;
  const newAction = currentSlot().idle;

  if (oldAction && newAction) {
    newAction.paused = false;
    newAction.enabled = true;
    newAction.play();
    newAction.crossFadeFrom(oldAction, 0.3, false);
  } else if (newAction) {
    newAction.play();
  }

  setCameraMode(newMode);
}