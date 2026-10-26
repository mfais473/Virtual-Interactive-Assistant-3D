import * as THREE from 'three';
import { state } from '../state.js';
import { getMouthLevel } from './lipsync.js';
import { updateExpressionBlend } from './expressions.js';

const CFG = {
  BREATH_SPEED: 1.5,     
  BREATH_AMOUNT: 0.03,   
  SWAY_AMOUNT: 0.035,    
  HEAD_AMOUNT: 0.06,     
  TALK_HEAD_BOOST: 1.8,  
  TALK_NOD: 0.07,        
  GAZE_AT_CAMERA: true, 
  SACCADE_MIN: 0.7,      
  SACCADE_MAX: 2.6,
  SACCADE_RANGE: 0.12, 
  GLANCE_CHANCE: 0.15,   
  BLINK_MIN: 2.0,
  BLINK_MAX: 5.5,
  DOUBLE_BLINK_CHANCE: 0.2,
};
const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();

function noise(t, seed) {
  return (
    (Math.sin(t * 0.71 + seed) +
      0.6 * Math.sin(t * 1.37 + seed * 2.3) +
      0.8 * Math.sin(t * 0.29 + seed * 4.1)) / 2.4
  );
}
const rand = (a, b) => a + Math.random() * (b - a);
const parts = {
  chest: { offset: new THREE.Quaternion(), node: null },
  neck: { offset: new THREE.Quaternion(), node: null },
  head: { offset: new THREE.Quaternion(), node: null },
};

export function removeProceduralOffsets() {
  for (const p of Object.values(parts)) {
    if (p.node) {
      p.node.quaternion.multiply(_q.copy(p.offset).invert());
      p.node = null;
    }
  }
}

function applyOffset(part, node, x, y, z) {
  if (!node) return;
  part.offset.setFromEuler(_euler.set(x, y, z));
  node.quaternion.multiply(part.offset);
  part.node = node;
}

let nextBlinkAt = 2;
let blinkQueue = 0;         
let blinkStartTime = null;
const BLINK_DURATION = 0.16;

function updateBlink(t) {
  const em = state.vrm?.expressionManager;
  if (!em) return;
  if (blinkStartTime === null && t > nextBlinkAt) {
    blinkStartTime = t;
    if (blinkQueue === 0 && Math.random() < CFG.DOUBLE_BLINK_CHANCE) blinkQueue = 1;
  }
  if (blinkStartTime !== null) {
    const p = (t - blinkStartTime) / BLINK_DURATION;
    if (p < 1) {
      em.setValue('blink', p < 0.5 ? p * 2 : (1 - p) * 2);
    } else {
      em.setValue('blink', 0);
      blinkStartTime = null;
      if (blinkQueue > 0) {
        blinkQueue--;
        nextBlinkAt = t + 0.12;                       
      } else {
        nextBlinkAt = t + rand(CFG.BLINK_MIN, CFG.BLINK_MAX);
      }
    }
  }
}

let gazeTarget = null;
let gazeOffset = new THREE.Vector3();
let gazeGoal = new THREE.Vector3();
let nextSaccadeAt = 1;
let glanceUntil = 0;

function ensureGazeTarget(vrm) {
  if (gazeTarget || !vrm?.lookAt || !state.scene) return;
  gazeTarget = new THREE.Object3D();
  state.scene.add(gazeTarget);
  vrm.lookAt.target = gazeTarget;
}

function updateGaze(t, dt) {
  const vrm = state.vrm;
  if (!CFG.GAZE_AT_CAMERA || !vrm?.lookAt || !state.camera) return;
  ensureGazeTarget(vrm);
  if (!gazeTarget) return;
  if (t > nextSaccadeAt) {
    if (Math.random() < CFG.GLANCE_CHANCE) {
      // lirikan besar ke samping/atas sebentar, lalu kembali menatap kamera
      gazeGoal.set(rand(-0.6, 0.6), rand(-0.15, 0.3), 0);
      glanceUntil = t + rand(0.5, 1.1);
      nextSaccadeAt = glanceUntil;
    } else {
      gazeGoal.set(
        rand(-CFG.SACCADE_RANGE, CFG.SACCADE_RANGE),
        rand(-CFG.SACCADE_RANGE, CFG.SACCADE_RANGE) * 0.7,
        0
      );
      nextSaccadeAt = t + rand(CFG.SACCADE_MIN, CFG.SACCADE_MAX);
    }
  }
  gazeOffset.lerp(gazeGoal, 1 - Math.exp(-14 * dt));
  gazeTarget.position.copy(state.camera.position).add(gazeOffset);
}

let lastT = 0;
let talk = 0;

export function updateProceduralMotion(elapsedTime) {
  const vrm = state.vrm;
  if (!vrm) return;
  const dt = Math.min(Math.max(elapsedTime - lastT, 0.001), 0.05);
  lastT = elapsedTime;
  const t = elapsedTime;
  const targetTalk = Math.min(1, getMouthLevel() / 0.6);
  talk += (targetTalk - talk) * (1 - Math.exp(-6 * dt));
  const headScale = 1 + talk * CFG.TALK_HEAD_BOOST;
  const h = vrm.humanoid;
  applyOffset(
    parts.chest,
    h?.getNormalizedBoneNode('chest') || h?.getNormalizedBoneNode('spine'),
    Math.sin(t * CFG.BREATH_SPEED) * CFG.BREATH_AMOUNT + noise(t, 1.0) * 0.01,
    noise(t * 0.6, 2.0) * CFG.SWAY_AMOUNT,
    noise(t * 0.5, 3.0) * CFG.SWAY_AMOUNT * 0.6
  );
  applyOffset(
    parts.neck,
    h?.getNormalizedBoneNode('neck'),
    noise(t, 4.0) * CFG.HEAD_AMOUNT * 0.4 * headScale,
    noise(t * 0.8, 5.0) * CFG.HEAD_AMOUNT * 0.4 * headScale,
    0
  );
  applyOffset(
    parts.head,
    h?.getNormalizedBoneNode('head'),
    noise(t * 1.1, 6.0) * CFG.HEAD_AMOUNT * 0.6 * headScale + talk * CFG.TALK_NOD,
    noise(t * 0.7, 7.0) * CFG.HEAD_AMOUNT * headScale,
    noise(t * 0.9, 8.0) * CFG.HEAD_AMOUNT * 0.5 * headScale
  );
  updateGaze(t, dt);
  updateBlink(t);
  updateExpressionBlend(dt);
}
