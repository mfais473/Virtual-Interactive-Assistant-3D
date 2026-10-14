import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
} from '@pixiv/three-vrm-animation';
import { state } from '../state.js';

const animLoader = new GLTFLoader();
animLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

// ✅ POIN #2: default diubah dari LoopPingPong → LoopRepeat
export function loadVrmaClip(path, vrm, onReady, trimSeconds, loopMode = THREE.LoopRepeat) {
  // ✅ POIN #1: mixer HARUS sudah ada, jangan bikin baru di sini
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

      // ✅ POIN #1: pakai mixer yang sudah ada, JANGAN bikin baru
      const action = state.mixer.clipAction(clip);

      if (loopMode === THREE.LoopOnce) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        // ✅ POIN #2: LoopRepeat, bukan LoopPingPong
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