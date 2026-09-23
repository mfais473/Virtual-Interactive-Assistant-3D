# VR Assistant

A desktop VRM avatar assistant that listens to your voice, replies through
the Google Gemini API, and reflects emotion through facial expressions and
body gestures — all rendered in real time with Three.js inside an Electron
window.

The app runs as a **transparent, frameless window** that can sit on top of
your desktop. There are no on-screen buttons — everything is controlled by
keyboard.

<!--
  DEMO GIF PLACEHOLDER
  When the demo GIF is ready, replace the line below with:
  ![Demo](docs/demo.gif)
  and delete this comment block.
-->

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
- **A VRM avatar file** (`.vrm`) — see [assets/README.md](assets/avatar/README.md)
- **`.vrma` animation files** — same README
- **A Google Gemini API key** — https://aistudio.google.com/app/apikey

---

## Setup

### 1. Install dependencies

```bash
npm install