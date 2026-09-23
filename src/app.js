import * as THREE from 'three';
import { state } from './state.js';
import { initScene, handleResize } from './core/scene.js';
import { initCamera, updateCamera } from './core/cameraRig.js';
import { loadVRM } from './avatar/vrm.js';
import { initAnimationSystem } from './avatar/animationState.js';
import { updateProceduralMotion } from './avatar/procedural.js';
import { updateLipSync } from './avatar/lipsync.js';
import { populateMicList } from './audio/recorder.js';
import { initKeyboard } from './input/keyboard.js';

export async function startApp() {
  // Setup scene & kamera
  initScene();
  initCamera();
  handleResize();

  // Load VRM (avatar)
  try {
    const vrm = await loadVRM('./assets/avatar.vrm');
    state.scene.add(vrm.scene);
    initAnimationSystem(vrm);
  } catch (err) {
    console.error('Pastikan file avatar.vrm sudah ditaruh di folder assets/');
  }

  // Mic & keyboard
  populateMicList();
  initKeyboard();

  startLoop();
}

function startLoop() {
  state.clock = new THREE.Clock();

  function tick() {
    requestAnimationFrame(tick);

    const dt = state.clock.getDelta();

    if (state.vrm) state.vrm.update(dt);

    if (state.mixer) state.mixer.update(dt);

    updateProceduralMotion(state.clock.getElapsedTime());

    updateLipSync();

    updateCamera();

    if (state.renderer && state.scene && state.camera) {
      state.renderer.render(state.scene, state.camera);
    }
  }

  tick();
}