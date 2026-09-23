import * as THREE from 'three';
import { state } from '../state.js';

export const CAMERA_CONFIGS = {
  full: {
    position: new THREE.Vector3(0, 1.0, 3.2),
    lookAt: new THREE.Vector3(0, 1.0, 0),
  },
  half: {
    position: new THREE.Vector3(0, 1.3, 1.1),
    lookAt: new THREE.Vector3(0, 1.35, 0),
  },
};

// Target transisi
let targetPos;
let targetLookAt;
let lookAtCurrent;

export function initCamera() {
  const camera = new THREE.PerspectiveCamera(
    35,
    window.innerWidth / window.innerHeight,
    0.1,
    20
  );

  camera.position.copy(CAMERA_CONFIGS.full.position);
  camera.lookAt(CAMERA_CONFIGS.full.lookAt);

  targetPos = camera.position.clone();
  targetLookAt = CAMERA_CONFIGS.full.lookAt.clone();
  lookAtCurrent = CAMERA_CONFIGS.full.lookAt.clone();

  state.camera = camera;
  return camera;
}

export function setCameraMode(mode) {
  const cfg = CAMERA_CONFIGS[mode];
  if (!cfg) return;
  targetPos.copy(cfg.position);
  targetLookAt.copy(cfg.lookAt);
}

export function updateCamera() {
  if (!state.camera) return;
  state.camera.position.lerp(targetPos, 0.08);
  lookAtCurrent.lerp(targetLookAt, 0.08);
  state.camera.lookAt(lookAtCurrent);
}