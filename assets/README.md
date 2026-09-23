# Avatar & Animation Assets

The `.vrm` avatar model and `.vrma` animation files used by this app are
**not bundled in this repository**, per the licensing terms described in
[docs/assets-and-credits.md](../../docs/assets-and-credits.md).

To run this app, obtain the assets below and place them exactly as listed.
Filenames must match — the app loads them by hardcoded path.

## Avatar Model

- **Source:** [VRoid Hub — *link TBD, will be added here*](https://hub.vroid.com/)
- **Conditions of use:** see the model's VRoid Hub page
- **Place at:** `assets/avatar.vrm`

> **Alternative — create your own:** use
> [VRoid Studio](https://vroid.com/en/studio) (free) to build a custom
> avatar. Export as VRM and place it at the path above.
>
> **VRM 0.x vs 1.0:** this project calls `VRMUtils.rotateVRM0()` in
> `src/avatar/vrm.js`, which is only needed for VRM 0.x models (they face
> −Z by default). If you supply a VRM 1.0 model, remove that call or the
> avatar will face the wrong way.

## Animation Files (.vrma)

All `.vrma` files are from the
[VRoid Project on BOOTH](https://booth.pm/en/items/5512385). They are free
to use but **may not be redistributed**, which is why they are not bundled
here. Commercial use requires a specific credit line — see
[docs/assets-and-credits.md](../../docs/assets-and-credits.md).

| File | Purpose |
|---|---|
| `idle-full.vrma` | Full-body idle pose — played once, then held |
| `idle-half.vrma` | Upper-body idle pose — played once, then held |
| `gesture-2.vrma` | **"pengenalan"** — introducing / greeting gesture |

> Additional gesture slots are reserved for future use
> (`gesture-1.vrma`, `gesture-3.vrma`); they are not currently referenced
> by the gesture registry in `main.js`.

Place all files directly in this folder (`assets/`).

## Where the app reads these

- Avatar path: `src/avatar/vrm.js`
- Idle & gesture paths: `src/avatar/animationState.js`
- Gesture → file mapping and prompt descriptions: `GESTURE_REGISTRY` at
  the top of `main.js`

## Folder structure once populated

```
assets/avatar/
├── avatar.vrm
├── idle-full.vrma
├── talking-full.vrma
├── idle-half.vrma
├── talking-half.vrma
├── gesture-1.vrma
├── gesture-2.vrma
└── gesture-3.vrma
```