# MotionFace

MotionFace is a local-first browser prototype for live face, pose, and hand tracking retargeted onto a generic articulated 3D avatar. The uploaded photo is kept separate from the rig; this prototype does not reconstruct a photo into a 3D person and does not claim to be a production AI animation engine.

## Requirements

- Node.js 20.9 or newer
- pnpm 11.25.0 (`corepack enable` if pnpm is not on PATH)
- A modern browser with WebGL and camera support. Camera access requires HTTPS or localhost and explicit browser permission.

## Run locally

```sh
pnpm install
pnpm dev
```

Open the local URL printed by Next.js. In Animation Studio, choose **Start camera & tracking** and grant camera permission to run the on-device MediaPipe face, pose, and hand models. The first start downloads the pinned MediaPipe package's WASM runtime and public model files. Camera frames remain in the browser; this prototype has no account, upload API, backend, database, or cloud inference.

Image Studio accepts PNG, JPEG, or WebP files up to 12 MiB after the user confirms they own the image or have permission to use the likeness. The image is decoded locally and held as a browser object URL. Deleting or unchecking consent removes it from the current session.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## Current scope and limits

- Face blendshapes/head landmarks, pose landmarks, and up to two hands drive limited controls on a generic procedural Three.js rig.
- Detection runs less frequently than rendering to preserve UI responsiveness; CPU-only inference may still be too slow on some devices.
- A selected photo is only previewed; it does not become the avatar.
- Virtual Camera controls are placeholders. A browser canvas stream is not an OS-wide virtual camera and cannot be selected in arbitrary desktop calling apps.
- Native Windows/macOS camera drivers, mobile camera replacement, accounts, cloud storage, billing, and asynchronous photo reconstruction are not implemented.

See [the technical foundation](docs/architecture/technical-foundation.md) for architecture, future database design, dependency documentation, platform boundaries, and risks.
