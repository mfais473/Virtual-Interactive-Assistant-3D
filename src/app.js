import * as THREE from 'three';
import { state } from './state.js';
import { initScene, handleResize } from './core/scene.js';
import { initCamera, updateCamera } from './core/cameraRig.js';
import { loadVRM } from './avatar/vrm.js';
import { initAnimationSystem } from './avatar/animationState.js';
import { updateProceduralMotion, removeProceduralOffsets } from './avatar/procedural.js';
import { initPoseLibrary } from './avatar/poseLibrary.js';
import { updatePoseCues } from './avatar/poseScheduler.js';
import { updateExpressionCues } from './avatar/expressionScheduler.js';
import { updateLipSync } from './avatar/lipsync.js';
import { populateMicList } from './audio/recorder.js';
import { initKeyboard } from './input/keyboard.js';
import { initSpeechBubble, updateSpeechBubble } from './ui/speechBubble.js';

let started = false;

export async function startApp() {
  if (started) {
    console.warn('⚠️ startApp() dipanggil ulang — diabaikan untuk mencegah loop ganda.');
    return;
  }
  started = true;
  initScene();
  initCamera();
  handleResize();
  try {
    const vrm = await loadVRM('./assets/avatar.vrm');
    state.scene.add(vrm.scene);
    initAnimationSystem(vrm);
  } catch (err) {
    console.error('Pastikan file avatar.vrm sudah ditaruh di folder assets/');
  }
  await initPoseLibrary();
  initSpeechBubble();
  populateMicList();
  initKeyboard();
  startLoop();
}

function startLoop() {
  state.clock = new THREE.Clock();
  let frames = 0;
  let last = performance.now();
  function tick() {
    requestAnimationFrame(tick);
    let dt = state.clock.getDelta();
    if (dt > 0.05) dt = 0.05;
    removeProceduralOffsets();   
    updatePoseCues();            
    updateExpressionCues();     
    if (state.mixer) state.mixer.update(dt);
    updateProceduralMotion(state.clock.getElapsedTime());
    if (state.vrm) state.vrm.update(dt);
    updateLipSync();
    updateCamera();
    updateSpeechBubble(dt);    
    if (state.renderer && state.scene && state.camera) {
      state.renderer.render(state.scene, state.camera);
    }
    frames++;
    const now = performance.now();
    if (now - last >= 1000) {
      console.log('FPS:', frames);
      frames = 0;
      last = now;
    }
  }
  tick();
}