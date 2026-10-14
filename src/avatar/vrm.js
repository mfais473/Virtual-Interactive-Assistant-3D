import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { state } from '../state.js';

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

// ✅ Tinggi target untuk semua VRM (dalam meter)
const TARGET_HEIGHT = 1.6;

export function loadVRM(url) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const vrm = gltf.userData.vrm;

        // ⚠️ JANGAN panggil removeUnnecessaryJoints di sini.
        // Panggil setelah semua animasi dimuat, kalau perlu.
        // VRMUtils.removeUnnecessaryJoints(vrm.scene);

        // VRM 0.x menghadap -Z; baris ini membalik supaya menghadap kamera.
        VRMUtils.rotateVRM0(vrm);

        // ✅ NORMALISASI SKALA
        // Hitung tinggi model saat ini, lalu sesuaikan agar = TARGET_HEIGHT
        const box = new THREE.Box3().setFromObject(vrm.scene);
        const currentHeight = box.max.y - box.min.y;

        if (currentHeight > 0) {
          const scaleFactor = TARGET_HEIGHT / currentHeight;
          vrm.scene.scale.setScalar(scaleFactor);

          // Rekam tinggi setelah scaling
          console.log(
            `📏 Skala VRM: ${currentHeight.toFixed(3)}m → ${TARGET_HEIGHT}m ` +
            `(factor: ${scaleFactor.toFixed(3)})`
          );
        } else {
          console.warn('⚠️ Tinggi VRM = 0, skip normalisasi skala.');
        }

        // ✅ Pastikan kaki menyentuh lantai
        // Setelah scaling, hitung ulang bounding box dan geser Y
        const boxAfter = new THREE.Box3().setFromObject(vrm.scene);
        vrm.scene.position.y -= boxAfter.min.y;

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