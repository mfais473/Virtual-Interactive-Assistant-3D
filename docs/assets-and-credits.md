# Assets & Credits

This document lists every third-party asset, library, and service used in
this project, along with their licenses and terms. It also clarifies what
is and isn't covered by this repository's source-code license.

## Scope & License

The **source code** in this repository (Electron shell, Three.js
integration, VRM loading, lipsync logic, gesture registry, and Gemini API
client code) is licensed under the
[Apache License 2.0](../LICENSE).

The Apache 2.0 license covers **only the code written for this project**.
It does **not** cover:

- Third-party assets (VRM model, `.vrma` animation files)
- Third-party services (Google Gemini API, and any other external API)
- Third-party libraries (Three.js, `@pixiv/three-vrm`, Electron, and other
  npm dependencies — each carries its own license in `node_modules/`)

Those items retain their own licenses and terms, described below.

---

## VRM Avatar Model

- **Created with:** VRoid Studio, pixiv Inc.
- **Status in this repo:** NOT included. Excluded via `.gitignore`.
- **Governing software terms:** [VRoid Studio Terms of Use](https://policies.pixiv.net/en.html#vroidstudio)
- **Source (project's default model):** [VRoid Hub — *link TBD, will be added here*](https://hub.vroid.com/)
- **Conditions of use for the default model:** see the "Conditions of Use"
  panel on the model's VRoid Hub page. That panel is authoritative for
  that model.
- **Placement instructions:** See [assets/README.md](../assets/README.md).

### Notes

- VRoid Studio is © pixiv Inc. Use of the software is governed by the
  VRoid Studio Terms of Use linked above.
- The project's default avatar, once published, will be distributed
  **only via VRoid Hub** — never bundled in this repository. This keeps
  the code license (Apache 2.0) separate from the model's own conditions
  of use.
- Users who supply their own VRM model are bound by the terms of
  whatever source they obtained it from.

---

## Animation Files (.vrma) — VRoid Project

- **Source:** [VRoid Project on BOOTH](https://booth.pm/en/items/5512385)
- **Status in this repo:** NOT included. The app loads these files from
  `assets/avatar/` at runtime; they are excluded via `.gitignore`.

### Terms summary

- **Copyright:** pixiv Inc. — remains theirs even after modification.
- **Redistribution of the raw motion data is prohibited.** This
  repository does not bundle `.vrma` files for this reason.
- **Modification, personal use, and commercial use are permitted.**
- **Prohibited uses:** religious or political content, denigration of
  third parties, illegal activity, and sexual or significantly violent
  content.
- Governed by the laws of Japan.

### Required credit (for commercial use)

Use this credit line verbatim:

> キャラクターアニメーション: ピクシブ株式会社 VRoidプロジェクト

or in English:

> Animation credits to pixiv Inc.'s VRoid Project

### Terms may change

The original terms state that conditions may be updated without notice,
and distribution may be suspended. For the latest terms, refer to the
original BOOTH page for each `.vrma` file you downloaded.

---

## Google Gemini API

This application uses the Google Gemini API for speech-to-text, response
generation, and text-to-speech. Use of this service is governed by:

- [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms)
- [Google APIs Terms of Service](https://developers.google.com/terms)

### Points to be aware of

- **API keys:** Users must supply their own Gemini API key via `.env`
  (see `.env.example`). No key is bundled with this repository.
- **Age requirements:** The Gemini API has an age restriction. Consult
  the terms linked above for the current minimum age and application
  restrictions before deploying this app for others. This project is not
  intended for use by, or exposure to, individuals below the minimum age
  set by those terms.
- **Output ownership:** Google's terms state that they do not claim
  ownership of generated content. See the terms for details and for any
  conditions that may apply to how generated content can be used.
- **Data usage:** Depending on your usage tier (unpaid vs. paid), Google
  may use submitted content to improve their products. Refer to the terms
  for the current scope of data usage before deploying this app for
  others.
- **Grounding/citation:** This app does not currently use Google Search
  grounding. If grounding is added later, source citations
  (CitationMetadata) must be displayed to end users where applicable.

The terms linked above are the authoritative source. They may change over
time; this document intentionally summarizes only high-level points and
defers to the official terms for any legally binding detail.

---

## Bundled npm Dependencies

This project uses the following open-source libraries (see `package.json`
for versions). Each is distributed under its own license, available in
each package's directory under `node_modules/`:

- **Electron** — MIT License
- **Three.js** — MIT License
- **@pixiv/three-vrm** — MIT License
- **@pixiv/three-vrm-animation** — MIT License
- **@google/genai** — Apache License 2.0

Consult each package's `LICENSE` file (inside `node_modules/<package>/`)
for the full text.

---

## Trademark Notice

"VRoid," "VRoid Studio," "VRoid Hub," and "pixiv" are trademarks of pixiv
Inc. "Gemini" and "Google" are trademarks of Google LLC. "Electron" is a
trademark of the OpenJS Foundation.

This project is an independent, unofficial use of these tools and is not
affiliated with, endorsed by, or sponsored by pixiv Inc., Google LLC, or
the OpenJS Foundation.

---

## Contact

For asset or rights inquiries, open an issue on this repository. For
private matters, reach out via Instagram:
[@agrion.virtual](https://instagram.com/agrion_virtual).

---

*Last updated: 2026-09-23*
