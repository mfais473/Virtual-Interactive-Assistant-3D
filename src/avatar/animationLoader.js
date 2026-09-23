import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
} from '@pixiv/three-vrm-animation';
import { state } from '../state.js';

const animLoader = new GLTFLoader();
animLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

export function loadVrmaClip(path, vrm, onReady, trimSeconds, loopMode = THREE.LoopPingPong) {
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

      if (!state.mixer) state.mixer = new THREE.AnimationMixer(vrm.scene);
      const action = state.mixer.clipAction(clip);

      if (loopMode === THREE.LoopOnce) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopPingPong, Infinity);
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