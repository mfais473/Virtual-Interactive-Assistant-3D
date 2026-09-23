import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { state } from '../state.js';

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

export function loadVRM(url) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const vrm = gltf.userData.vrm;
        VRMUtils.removeUnnecessaryJoints(vrm.scene);

        // VRM 0.x menghadap -Z; baris ini membalik supaya menghadap kamera.
        // Kalau modelmu VRM 1.0, biasanya tidak perlu ini.
        VRMUtils.rotateVRM0(vrm);

        state.vrm = vrm;
        console.log('VRM berhasil dimuat:', vrm);
        resolve(vrm);
      },
      (progress) => {
        if (progress.total) {
          const pct = (100.0 * (progress.loaded / progress.total)).toFixed(1);
          console.log('Loading model...', pct, '%');
        }
      },
      (error) => {
        console.error('Gagal load VRM:', error);
        reject(error);
      }
    );
  });
}