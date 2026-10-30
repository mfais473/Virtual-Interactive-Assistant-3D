# Virtual Interactive Assistant 3D (VIA-3D)

A desktop VRM avatar assistant that listens to your voice, replies through
the LLM API, and reflects emotion through facial expressions and
body gestures — all rendered in real time with Three.js inside an Electron
window.

The app runs as a **transparent, frameless window** that can sit on top of
your desktop. There are no on-screen buttons — everything is controlled by
keyboard.

*The avatar window in action.*

![VIA-3D preview](assets/preview.jpeg)

*Live demo: voice reply, lipsync, and body gestures.*

![VIA-3D demo](assets/preview.gif)

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
- **Tool calling & agent skills** — the LLM can invoke local tools via
  inline tags like `[tool:open_browser|https://google.com]`, and in
  v0.3.0 the agent can also plan multi-step tasks. Available tools:
  - **Core tools:** `open_browser`, `screenshot`, `view_screenshot`,
    `find_files`, `read_pdf`, `pdf_pick_and_read`
  - **File & workspace:** `read_excel`, `create_excel`, `project_list`,
    `project_read_file`, `project_write_file`, `project_edit_file`,
    `project_propose_plan`, `apply_patch`
  - **Agent loop:** `reason` (internal reasoning step)
- **Agent skills** *(new in v0.3.0)* — the assistant can read PDF and
  Excel files, and perform "vibe coding" by proposing and applying code
  patches to your workspace through a plan-and-confirm loop.

---

## Requirements

- **Node.js** 18+ (`node -v` to check)
- **A VRM avatar file** (`.vrm`) — see [assets/README.md](assets/README.md)
- **`.vrma` animation files** — same README
- **A Google Gemini API key (or with another provider)** — https://aistudio.google.com/app/apikey (for gemini API key)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure your API key

Copy `.env.example` to `.env` and fill in your key:

```bash
cp .env.example .env
```

Then edit `.env`.

### 3. Provide the avatar and animation assets

See [assets/README.md](assets/README.md) for exact filenames and
placement. The app expects:

```
assets/
├── avatar.vrm
├── poses/
│    ├── bow.vrma
│    ├── nod.vrma
│    ├── greeting.vrma
│    └── ... (see src/avatar/poses.json for the full list)
├── idle-full.vrma
├── idle-half.vrma
├── gesture-1.vrma
├── gesture-2.vrma
├── gesture-3.vrma
└── gesture-4.vrma
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
| `Y` / `N` | Confirm / reject the agent's proposed plan |

The window is draggable — click and hold on any empty area (not on a
button) to move it around your desktop.

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
- **Speech-to-Text and Text-to-Speech services powered by [ElevenLabs](https://elevenlabs.io/).**
- Avatar rendering via [Three.js](https://threejs.org/) and
  [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm).
- Animation files sourced from the
  [VRoid Project on BOOTH](https://booth.pm/en/items/5512385) — see
  [docs/assets-and-credits.md](docs/assets-and-credits.md) for the required
  credit line if you use them commercially.
