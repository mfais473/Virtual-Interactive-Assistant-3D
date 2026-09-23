const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
require('dotenv').config();

const { GoogleGenAI } = require('@google/genai');

if (!process.env.GEMINI_API_KEY) {
  console.error(
    'GEMINI_API_KEY tidak ditemukan! Pastikan file .env ada di folder yang ' +
    'SAMA dengan package.json/main.js ini (' + __dirname + '), ' +
    'dan berisi baris: GEMINI_API_KEY=key_anda'
  );
}

const genAI = new GoogleGenAI({ vertexai: false, apiKey: process.env.GEMINI_API_KEY });

// =====================================================================
// GESTURE REGISTRY
// =====================================================================
const GESTURE_REGISTRY = {
  pengenalan: {
    file: 2, // -> assets/gesture-2.vrma
    description:
      'Gerakan memperkenalkan diri atau menunjuk ke arah sesuatu. Pakai saat ' +
      'pertama kali menyapa di sesi baru, atau saat memperkenalkan topik/orang.',
    pairsWith: ['happy', 'neutral'],
    speakStartTime: 3.8, // Parameter untuk menyesuaikan waktu avatar tepat berbicara dengan gesture
  },
};

// Mapping tag Bahasa Indonesia -> nama expression preset standar VRM
const EMOTION_TAG_MAP = {
  senang: 'happy',
  sedih: 'sad',
  marah: 'angry',
  terkejut: 'surprised',
  tenang: 'relaxed',
  netral: 'neutral',
};

// =====================================================================
// PROMPT BUILDER
// =====================================================================
function buildGesturePromptSection() {
  return Object.entries(GESTURE_REGISTRY)
    .map(([key, g]) => `  [gesture:${key}] → ${g.description}`)
    .join('\n');
}

const SYSTEM_PROMPT = `Kamu adalah asisten AI ramah dengan avatar 3D humanoid dengan nama Via Anastashia.
Dengarkan audio dari pengguna, lalu jawab isi ucapannya dengan singkat dan
natural dalam Bahasa Indonesia -- seperti sedang mengobrol lewat suara,
bukan menulis esai panjang.

PENTING -- format jawaban WAJIB diawali tag action. Boleh lebih dari satu tag,
ditulis berurutan tanpa spasi, baru teks ucapan.

Tag ekspresi wajah (WAJIB ada tepat satu di setiap jawaban):
  [senang] [sedih] [marah] [terkejut] [tenang] [netral]
Pilih yang paling sesuai dengan nada jawabanmu.

Tag gestur tubuh (OPSIONAL -- pakai SESEKALI saja, jangan setiap jawaban):
${buildGesturePromptSection()}

Aturan gestur:
- Maksimal SATU gesture per jawaban.
- Jangan pakai gesture di setiap jawaban -- cukup saat benar-benar terasa pas
  (menyapa pertama kali, merayakan, menyampaikan simpati, dst).
- Kalau ragu, lebih baik tidak pakai gesture sama sekali.

Contoh valid:
  "[senang] Halo juga! Kabar aku baik, terima kasih sudah nanya."
  "[senang][gesture:pengenalan] Hai! Aku Via, senang bertemu kamu."
  "[sedih][gesture:sedih] Aku turut prihatin mendengarnya."
  "[netral] Baik, aku catat ya."

Jangan pernah memakai tag selain 6 emosi dan gesture yang terdaftar di atas.
Jangan pernah menulis tag di tengah atau akhir jawaban -- hanya di awal.`;

// =====================================================================
// PARSER -- tag di awal teks -> array action { name, args }.
// =====================================================================

function parseOneTag(tag) {
  const t = tag.trim().toLowerCase();

  if (EMOTION_TAG_MAP[t]) {
    return {
      name: 'set_expression',
      args: { emotion: EMOTION_TAG_MAP[t] },
    };
  }

  const g = t.match(/^gesture:(\w+)$/);
  if (g) {
    const semantic = g[1];
    const entry = GESTURE_REGISTRY[semantic];
    if (entry) {
      return {
        name: 'play_gesture',
        args: { number: entry.file, semantic, speakStartTime: entry.speakStartTime ?? 0 },
      };
    }
    console.warn('[WARNING] Gesture tidak dikenal:', semantic);
    return null;
  }

  console.warn('[WARNING] Tag tidak dikenal:', tag);
  return null;
}
// cleanText 
function parseActions(text) {
  const actions = [];
  const tagRe = /^\s*\[([^\]]+)\]\s*/;
  let remaining = text;
  let m;

  while ((m = remaining.match(tagRe))) {
    const action = parseOneTag(m[1]);
    if (action) actions.push(action);
    remaining = remaining.slice(m[0].length);
  }

  if (actions.length === 0) {
    console.warn(
      '[WARNING] Tidak ada tag action di awal jawaban, fallback ke netral. Teks:',
      text.slice(0, 50)
    );
    actions.push({ name: 'set_expression', args: { emotion: 'neutral' } });
  }

  return { actions, cleanText: remaining };
}

function checkGestureEmotionConsistency(actions) {
  const expr = actions.find((a) => a.name === 'set_expression');
  const gest = actions.find((a) => a.name === 'play_gesture');
  if (!expr || !gest) return;

  const semantic = gest.args.semantic;
  const entry = GESTURE_REGISTRY[semantic];
  if (!entry) return;

  const emotion = expr.args.emotion;
  if (!entry.pairsWith.includes(emotion)) {
    console.warn(
      `[KONSISTENSI] Emosi "${emotion}" dipasangkan dengan gesture "${semantic}" ` +
      `(biasanya cocok dengan: ${entry.pairsWith.join(', ')})`
    );
  }
}

// =====================================================================
// PCM -> WAV.
// =====================================================================
function pcmToWavBase64(pcmBase64) {
  const pcmBuffer = Buffer.from(pcmBase64, 'base64');
  const wavHeader = Buffer.alloc(44);

  const sampleRate = 24000; // Gemini output 24kHz
  const numChannels = 1;    // Mono
  const byteRate = sampleRate * numChannels * 2; // 16-bit
  const blockAlign = numChannels * 2;

  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(numChannels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([wavHeader, pcmBuffer]).toString('base64');
}

// =====================================================================
// IPC HANDLERS
// =====================================================================
ipcMain.on('app-quit', () => {
  app.quit();
});

ipcMain.handle('process-turn', async (event, { audioBase64, mimeType }) => {
  try {
    const understandResponse = await genAI.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [{ inlineData: { mimeType, data: audioBase64 } }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });
    const rawReplyText = understandResponse.text;

    const { actions, cleanText } = parseActions(rawReplyText);

    checkGestureEmotionConsistency(actions);

    const ttsResponse = await genAI.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: [{ parts: [{ text: cleanText }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Aoede' },
          },
        },
      },
    });

    const rawAudioBase64 = ttsResponse.candidates[0].content.parts[0].inlineData.data;
    const wavAudioBase64 = pcmToWavBase64(rawAudioBase64);

    return {
      text: cleanText,
      audioBase64: wavAudioBase64,
      actions, // [{ name: 'set_expression', args: { emotion: 'happy' } }, ...]
    };
  } catch (error) {
    console.error('Terjadi error saat memproses audio di Gemini:', error);
    throw error;
  }
});

// =====================================================================
// WINDOW MANAGEMENT
// =====================================================================
let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 900,
    transparent: true,
    frame: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;
  win.loadFile('index.html');
  win.webContents.openDevTools({ mode: 'detach' });
}

// Resize window lewat keyboard (+/-)
const RESIZE_MIN = 300;
const RESIZE_MAX = 1600;
const RESIZE_STEP = 1.08;

ipcMain.on('resize-window', (event, direction) => {
  if (!mainWindow) return;

  const bounds = mainWindow.getBounds();
  const factor = direction === 'in' ? RESIZE_STEP : 1 / RESIZE_STEP;

  let newWidth = Math.round(bounds.width * factor);
  let newHeight = Math.round(bounds.height * factor);
  newWidth = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX, newWidth));
  newHeight = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX, newHeight));

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  mainWindow.setBounds({
    x: Math.round(centerX - newWidth / 2),
    y: Math.round(centerY - newHeight / 2),
    width: newWidth,
    height: newHeight,
  });
});

app.whenReady().then(() => {
  createWindow();

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});