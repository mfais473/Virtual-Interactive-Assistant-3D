import { state } from '../state.js';
import { loadVrmaAction } from './animationLoader.js';
const MANIFEST_URL = './src/avatar/poses.json';
const POSE_DIR = './assets/poses/';
let manifest = {};
const requests = new Map(); 
const loaded = new Map();   

export async function initPoseLibrary() {
  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    manifest = {};
    for (const [name, info] of Object.entries(json.poses ?? {})) {
      manifest[name.trim().toLowerCase()] = info ?? {};
    }
    console.log('Pose terdaftar:', Object.keys(manifest));
    // Pose "filler" dimuat di awal: dipakai penjadwal untuk mengisi jeda gerak.
    getFillerNames().forEach((n) => loadPose(n));
  } catch (err) {
    console.warn('[pose] Gagal memuat poses.json, pose jawaban dinonaktifkan:', err);
    manifest = {};
  }
}

export function getFillerNames() {
  return Object.entries(manifest)
    .filter(([, info]) => info?.filler)
    .map(([name]) => name);
}

export function getPoseInfo(name) {
  return manifest[name] ?? null;
}

export function loadPose(name) {
  if (requests.has(name)) return requests.get(name);
  const info = manifest[name];
  if (!info?.file || !state.vrm) {
    console.warn('[pose] Pose tidak terdaftar / VRM belum siap:', name);
    return Promise.resolve(null);
  }
  const req = loadVrmaAction(`${POSE_DIR}${info.file}`, state.vrm).then((action) => {
    if (action) {
      action.userData = { isPose: true, name };
      loaded.set(name, action);
    }
    return action;
  });
  requests.set(name, req);
  return req;
}

export async function prefetchPoses(names, timeoutMs = 600) {
  const unique = [...new Set((names ?? []).filter(Boolean))];
  if (unique.length === 0) return;
  await Promise.race([
    Promise.all(unique.map(loadPose)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export function getLoadedPose(name) {
  return loaded.get(name) ?? null;
}
