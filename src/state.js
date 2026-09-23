// State store global

export const state = {
  // Three.js core
  scene: null,
  renderer: null,
  camera: null,
  clock: null,

  // Avatar
  vrm: null,
  mixer: null,

  // Animasi
  animations: { full: { idle: null }, half: { idle: null } },
  gestureActions: { 1: null, 2: null, 3: null },

  // Mode & status
  currentMode: 'full',
  isTalking: false,

  // Ekspresi & lipsync
  currentExpression: 'neutral',
  lipSyncActive: false,

  // Recording
  isRecording: false,
};