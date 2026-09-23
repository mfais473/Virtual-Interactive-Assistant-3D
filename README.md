# Virtual Interactive Assistant 3D (VIA-3D)

A desktop VRM avatar assistant that listens to your voice, replies through
the Google Gemini API, and reflects emotion through facial expressions and
body gestures — all rendered in real time with Three.js inside an Electron
window.

The app runs as a **transparent, frameless window** that can sit on top of
your desktop. There are no on-screen buttons — everything is controlled by
keyboard.

---

## Features

- **Voice conversation** — press `R` to record, speak, and the app sends
  the audio to Gemini for speech-to-text, response generation, and
  text-to-speech playback.
- **Real-time lipsync** — mouth movement is driven by the live volume of
  the AI's audio reply, analyzed via the Web Audio API.
- **Emotion-driven expressions** — the LLM tags each reply with an emotion,
  which the app translates into a VRM facial expression preset (happy,
  sad, angry, etc.).
- **Semantic gestures** — the LLM can trigger body animations by meaning
  (e.g. `[gesture:pengenalan]`), mapped to `.vrma` files through a central
  registry. Adding a new gesture requires editing only one place.
- **Two camera modes** — full-body and half-body (upper body close-up for
  conversation).
- **Procedural idle motion** — subtle breathing, head sway, and periodic
  blinking, layered on top of the base `.vrma` pose.

---

## Requirements

- **Node.js** 18+ (`node -v` to check)
- **A VRM avatar file** (`.vrm`) — see [assets/README.md](assets/README.md)
- **`.vrma` animation files** — same README
- **A Google Gemini API key** — https://aistudio.google.com/app/apikey

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure your Gemini API key

Copy `.env.example` to `.env` and fill in your key:

```bash
cp .env.example .env
```

Then edit `.env`:

```
GEMINI_API_KEY=your_key_here
```

The `.env` file is git-ignored and never leaves your machine.

### 3. Provide the avatar and animation assets

See [assets/README.md](assets/README.md) for exact filenames and
placement. The app expects:

```
assets/
├── avatar.vrm
├── idle-full.vrma
├── idle-half.vrma
├── gesture-1.vrma
├── gesture-2.vrma
└── gesture-3.vrma
```

### 4. Run the app

```bash
npm start
```

A transparent window will appear with your avatar. DevTools opens
automatically for console logs — useful for debugging.

---

## Controls

| Key | Action |
|---|---|
| `R` | Start / stop recording (toggle) |
| `M` | Switch camera mode (full body ↔ half body) |
| `1` / `2` / `3` | Manually play gesture 1 / 2 / 3 |
| `+` / `=` | Enlarge window |
| `-` / `_` | Shrink window |
| `Esc` | Quit application |

The window is draggable — click and hold on any empty area (not on a
button) to move it around your desktop.

---

## How it works (brief)

1. **Record** — pressing `R` starts capturing audio from your default mic
   via `MediaRecorder`.
2. **Send to Gemini** — the audio is sent to the Electron main process
   (via IPC, so the API key never touches the renderer) and forwarded to
   Gemini for:
   - Speech-to-text
   - Response generation (with a system prompt that enforces an
     emotion/gesture tag format)
   - Text-to-speech synthesis
3. **Parse tags** — the main process extracts emotion and gesture tags
   from the reply, then strips them so the TTS only speaks the clean text.
4. **Playback + animation** — the renderer plays the returned audio while:
   - Driving lipsync from live audio volume
   - Applying the emotion as a VRM facial expression
   - Playing any triggered gesture animation
5. **Return to idle** — when the audio ends, the avatar crossfades back
   to the idle pose and neutral expression.

### Project structure

```
src/
├── renderer.js              # Entry point (thin)
├── app.js                   # Orchestrator + animation loop
├── state.js                 # Shared state store
├── core/
│   ├── scene.js             # Three.js scene, renderer, lights
│   └── cameraRig.js         # Camera modes + smooth transitions
├── avatar/
│   ├── vrm.js               # VRM loading
│   ├── animationLoader.js   # Generic .vrma loader
│   ├── animationState.js    # Idle / gesture / talking state
│   ├── actionDispatcher.js  # Routes LLM actions to handlers
│   ├── expressions.js       # Facial expression presets
│   ├── lipsync.js           # Audio analysis → mouth blendshape
│   └── procedural.js        # Breathing, head sway, blinking
├── audio/
│   ├── recorder.js          # Mic capture + MediaRecorder
│   └── playback.js          # Reply playback + dispatch
└── input/
    └── keyboard.js          # Key bindings

main.js                      # Electron main process + Gemini client
preload.js                   # Secure IPC bridge
index.html                   # Renderer entry + importmap
```

---

## Troubleshooting

### Avatar doesn't appear

- Check DevTools console for errors from `src/avatar/vrm.js`.
- The most common cause: the file isn't at `assets/avatar.vrm` or isn't
  named exactly that.
- If the screen is black, the camera might be positioned too far or too
  close — adjust `CAMERA_CONFIGS` in `src/core/cameraRig.js`.

### Avatar faces away from the camera

This project calls `VRMUtils.rotateVRM0()` in `src/avatar/vrm.js`, which
is only needed for **VRM 0.x** models (they face −Z by default). If you
use a **VRM 1.0** model, comment out that line or the avatar will face
the wrong way.

### "GEMINI_API_KEY tidak ditemukan" on startup

- Make sure `.env` exists in the **same folder as `package.json`**.
- Make sure it contains a valid line: `GEMINI_API_KEY=...`
- Restart the app after editing `.env` — it's read only at startup.

### Mic indicator stays on after recording

- The app stops the mic track as soon as recording ends. If the OS
  indicator stays on, close the app and reopen — this is usually an OS
  caching issue, not a bug in the app.

### Voice reply plays but mouth doesn't move

- Lipsync only runs in **half-body mode** by default (the face is too
  small in full-body mode). Press `M` to switch.
- Check that `speechConfig` in `main.js` is producing audio output —
  if the TTS response is empty, there's nothing to analyze.

---

## License

- **Source code:** [Apache License 2.0](LICENSE)
- **Third-party assets and services:** see
  [docs/assets-and-credits.md](docs/assets-and-credits.md)

This repository does **not** bundle the VRM avatar or `.vrma` animation
files. You must supply your own — see [assets/README.md](assets/README.md).

---

## Credits

- Voice, response, and speech synthesis powered by
  [Google Gemini API](https://ai.google.dev/).
- Avatar rendering via [Three.js](https://threejs.org/) and
  [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm).
- Animation files sourced from the
  [VRoid Project on BOOTH](https://booth.pm/en/items/5512385) — see
  [docs/assets-and-credits.md](docs/assets-and-credits.md) for the required
  credit line if you use them commercially.
