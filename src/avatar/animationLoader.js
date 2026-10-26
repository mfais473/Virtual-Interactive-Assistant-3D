import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
} from '@pixiv/three-vrm-animation';
import { state } from '../state.js';

const animLoader = new GLTFLoader();
animLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

export function loadVrmaClip(path, vrm, onReady, trimSeconds, loopMode = THREE.LoopRepeat) {
  if (!state.mixer) {
    console.error('Mixer belum diinisialisasi. Panggil initAnimationSystem() dulu.');
    return;
  }

  animLoader.load(
    path,
    (gltf) => {
      const vrmAnimation = gltf.userData.vrmAnimations?.[0];
      if (!vrmAnimation) {
        console.error(`File ${path} tidak berisi animasi yang valid.`);
        return;
      }

      let clip = createVRMAnimationClip(vrmAnimation, vrm);

      if (trimSeconds) {
        const fps = 30;
        clip = THREE.AnimationUtils.subclip(
          clip,
          `${path}-trimmed`,
          0,
          trimSeconds * fps,
          fps
        );
      }

      const action = state.mixer.clipAction(clip);

      if (loopMode === THREE.LoopOnce) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }

      onReady(action);
      console.log(
        `Animasi dari ${path} berhasil dimuat.` +
        (trimSeconds ? ` (dipotong ${trimSeconds} detik pertama)` : '')
      );
    },
    undefined,
    (error) => {
      console.error(`Gagal load animasi ${path}: file mungkin belum ada di assets/`, error);
    }
  );
}

export function loadVrmaAction(path, vrm) {
  return new Promise((resolve) => {
    if (!state.mixer) {
      console.error('Mixer belum diinisialisasi. Panggil initAnimationSystem() dulu.');
      resolve(null);
      return;
    }

    animLoader.load(
      path,
      (gltf) => {
        const vrmAnimation = gltf.userData.vrmAnimations?.[0];
        if (!vrmAnimation) {
          console.error(`File ${path} tidak berisi animasi yang valid.`);
          resolve(null);
          return;
        }

        vrmAnimation.expressionTracks.preset.clear();
        vrmAnimation.expressionTracks.custom.clear();

        const clip = createVRMAnimationClip(vrmAnimation, vrm);
        const action = state.mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;

        console.log(`Pose dari ${path} berhasil dimuat. (${clip.duration.toFixed(2)} detik)`);
        resolve(action);
      },
      undefined,
      (error) => {
        console.error(`Gagal load pose ${path}: file mungkin belum ada di assets/poses/`, error);
        resolve(null);
      }
    );
  });
}
