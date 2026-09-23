import { state } from '../state.js';
import { resumeAudioContext } from '../avatar/lipsync.js';

const micSelect = document.getElementById('micSelect');

let mediaRecorder = null;
let audioChunks = [];
let currentStream = null;

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export async function populateMicList() {
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tempStream.getTracks().forEach((t) => t.stop());
  } catch (err) {
    console.error('Tidak bisa akses mic untuk deteksi device:', err.message);
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((d) => d.kind === 'audioinput');

  micSelect.innerHTML = '';
  mics.forEach((mic, i) => {
    const option = document.createElement('option');
    option.value = mic.deviceId;
    option.textContent = mic.label || `Mic ${i + 1}`;
    micSelect.appendChild(option);
  });

  console.log('Mic terdeteksi:', mics.map((m) => m.label));
}

export async function startRecording(onResult) {
  if (state.isRecording) return;

  await resumeAudioContext();

  let stream;
  try {
    const selectedDeviceId = micSelect.value;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
    });
  } catch (err) {
    console.error('Gagal akses mic:', err.message);
    return;
  }

  currentStream = stream;
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    console.log('Ukuran audio blob:', audioBlob.size, 'bytes');
    console.log('Memproses (Gemini)...');

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = arrayBufferToBase64(arrayBuffer);

      const result = await window.api.processTurn(base64Audio, 'audio/webm');
      console.log('AI:', result.text);

      if (onResult) onResult(result);
    } catch (err) {
      console.error('Gagal memproses:', err.message);
    }

    stream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  };

  mediaRecorder.start();
  state.isRecording = true;
  console.log('Merekam... bicara sekarang');
}

export function stopRecording() {
  if (!state.isRecording || !mediaRecorder) return;
  mediaRecorder.stop();
  state.isRecording = false;
}

export function toggleRecording(onResult) {
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording(onResult);
  }
}