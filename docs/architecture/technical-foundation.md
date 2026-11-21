# MotionFace Technical Foundation

**Status:** Architecture selected for Phase 1 and the first browser milestone.
**Scope:** A local-first browser prototype that proves camera tracking and retargeting into a generic 3D avatar. It does not reconstruct the uploaded person as a 3D human or claim to provide a production AI animation engine.

## Repository and environment inspection

- The connected GitHub account exposes ten repositories. None is named MotionFace. The repository named `my-work` is unrelated and will not be used.
- The MotionFace workspace starts without a Git repository or project files.
- Available: Node.js 24.22.3, pnpm 11.25.0, Git 2.55.0, Python 3.14.7.
- `npm` is unavailable; npm is configured offline. The pnpm content store is empty. Installing JavaScript packages requires access to the package registry.
- No Supabase project credentials, GPU inference host, or existing avatar assets are present in the workspace.

## Architecture decision

Use a pnpm TypeScript monorepo, starting with one Next.js web app and small internal packages only where a real boundary is needed. Keep camera and inference UI in browser-only client modules. Keep landmark types and motion retargeting independent of React and Three.js. The initial web app runs the MediaPipe Tasks Vision models in the browser and sends normalized tracking results to an avatar renderer. The model is a generic rig; the uploaded photo remains a separately prepared visual asset until a real photo-to-avatar/reconstruction pipeline is selected and built.

### Proposed repository layout

```text
apps/
  web/                         Next.js dashboard and browser camera studio
  api/                         Later: Node.js API for authenticated metadata/jobs
packages/
  contracts/                   Shared TypeScript schemas and API/event contracts
  motion-core/                 Normalized landmark types, smoothing, retargeting
  tracking-web/                MediaPipe initialization and face/pose/hand adapters
  avatar-three/                Three.js avatar loading, rig mapping and renderer
  video-output/                Output interface; browser captureStream implementation
services/
  ai-inference/                Later: Python/PyTorch/ONNX asynchronous model worker
apps-desktop/                  Later: Electron shell and platform launchers
apps-mobile/                   Later: React Native application
infra/supabase/migrations/     PostgreSQL schema, RLS and private Storage policies
docs/                           Architecture, platform matrix, setup and decisions
```

Only `apps/web`, `packages/motion-core`, `packages/tracking-web`, and `packages/avatar-three` are Phase 1 runtime candidates. Avoid committing empty future applications: create those packages when implementation begins. Use Next.js route handlers for the first same-origin web endpoints if one is later needed; introduce `apps/api` when independent deployment, external clients, or job orchestration justify it. Do not add a separate Node API to the camera frame loop.

## Component boundaries

| Boundary | Owns | Must not own |
| --- | --- | --- |
| `apps/web` | Dashboard, upload consent and validation, camera/microphone permissions, device selection, preview UI, user-visible lifecycle/errors | Landmark math, Three.js scene internals, Python model inference |
| `packages/contracts` | Versioned types/schemas for assets, sessions, normalized landmarks, inference jobs and API payloads | Browser APIs, database client, renderer state |
| `packages/motion-core` | Coordinate normalization, confidence handling, smoothing, landmark-to-rig controls, deterministic unit-testable math | Camera capture, MediaPipe classes, UI, rendering |
| `packages/tracking-web` | MediaPipe Tasks Vision model setup, video-frame scheduling, face blendshape/landmark, pose and hand results; camera-independent detector interface | User accounts, persisted photos, avatar drawing |
| `packages/avatar-three` | Renderer lifecycle, generic rig/GLB loading, mapping motion controls to bones and face morph targets, disposal | Camera permissions, data persistence, inference model selection |
| `packages/video-output` | Output contract and browser `canvas.captureStream()` implementation where available | Claiming a system-wide virtual camera or bypassing OS policy |
| `apps/api` (later) | Authenticated metadata, asset lifecycle, quotas, async job enqueue/status | Frame-rate tracking or GPU rendering on request thread |
| `services/ai-inference` (later) | Versioned model adapters, asynchronous photo animation/reconstruction jobs, GPU scheduling, result metadata | WebRTC camera loop or silently substituting procedural motion for AI output |

Keep raw photos, camera frames, landmarks and generated media local by default in the prototype. The tracking contract must allow a later remote inference implementation without leaking renderer-specific types.

## Dependency choices and current documentation

| Need | Phase 1 choice | Boundary / reason | Current official documentation |
| --- | --- | --- | --- |
| Web app | Next.js 16.4.6, React 19.3.0, TypeScript | Keep layout/server rendering separate from browser-only studio client components | [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) |
| Styling | Tailwind CSS or small scoped CSS where it reduces setup | Dark, responsive dashboard; avoid adding a component kit before UI needs are known | [Tailwind with Next.js](https://tailwindcss.com/docs/guides/nextjs) |
| Camera CV | `@mediapipe/tasks-vision` 1.2.3 | Face, pose and hand landmarks plus face blendshape scores; browser video mode | [MediaPipe Web guide](https://ai.google.dev/edge/mediapipe/solutions/guide), [Tasks Vision web README](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md) |
| Renderer | Three.js 0.187.0 (`WebGLRenderer` initially) | Direct module boundary, avoids adding a React renderer; use glTF/VRM assets when a licensed rig is selected | [Three.js docs](https://threejs.org/docs/), [Animation loop](https://threejs.org/docs/#api/en/renderers/WebGLRenderer.setAnimationLoop), [GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader) |
| Monorepo | pnpm 11.25.0 workspaces | Available in this environment; lockfile gives one reproducible dependency graph | [pnpm workspaces](https://pnpm.io/workspaces) |
| Tests | Vitest 5.1.1 for pure TypeScript motion math; browser smoke checks for camera/render integration | Keep smoothing and retargeting testable without a webcam/GPU | [Vitest guide](https://vitest.dev/guide/) |
| Persistence/auth (later) | Supabase Auth + PostgreSQL + private Storage | RLS ownership policies; no credentials or user data service needed for local-first milestone | [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Next.js Auth](https://supabase.com/docs/guides/auth/server-side/nextjs) |
| API (later) | Node.js/TypeScript; Next route handlers first | Add standalone service only when independent deployments/jobs need it | [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) |
| AI inference (later) | Python service boundary; select PyTorch or ONNX Runtime after a model benchmark | Keep asynchronous GPU work off the browser frame loop and avoid premature model/provider lock-in | [PyTorch](https://pytorch.org/docs/stable/index.html), [ONNX Runtime](https://onnxruntime.ai/docs/) |

Current API guidance was checked through Context7 on 2026-11-21. The API signatures confirmed include Next.js client-component isolation for browser APIs, MediaPipe Tasks Vision `VIDEO` mode and `detectForVideo` family, Three.js `WebGLRenderer.setAnimationLoop`, and Supabase RLS. Exact package versions must be resolved from the package registry when network access is available, then frozen in `pnpm-lock.yaml`; do not copy a `latest` tag into production configuration.

### Deferred dependencies

Do not add Supabase SDK/CLI, Stripe, PostHog, Resend, LiveKit, Electron, React Native, PyTorch, ONNX Runtime, or a remote GPU provider in this milestone. There is no working feature that needs them yet. Select and document a rig/asset license before bundling any third-party avatar model. Avoid sending face/body landmarks or photos to analytics.

## Data and database architecture

The browser milestone stores the selected photo as an in-memory `File`/object URL and the camera stream in memory. No account, photo upload endpoint, database, or remote processing is required. Revoke object URLs and stop every media track on replacement, stop, unmount, and errors.

When accounts and cloud storage begin, add migrations for:

- `profiles`: primary key references `auth.users(id)` with cascade deletion; display name and timestamps only. RLS permits each user to read/update their own row.
- `media_assets`: owner id, generated id, private storage object path, MIME type, byte count, image dimensions, content hash, consent timestamp/version, created/deleted timestamps. Never store a public photo URL. RLS requires `owner_id = auth.uid()` for select/insert/update/delete.
- `avatars`: owner id, source `media_assets` id, label, `portrait`/`full_body` mode, representation kind (`photo`, `rigged_3d`, later `generated`), processing status, optional model/rig version, timestamps. No claim that the original image is a complete 3D reconstruction.
- `animation_jobs` (only when asynchronous processing exists): owner id, avatar id, model/version, queued/running/succeeded/failed/canceled state, progress, safe error code, output asset id, timestamps. Enforce ownership and idempotency; never persist camera frame streams by default.

Create a private `user-media` Storage bucket with a size ceiling and image MIME allowlist. Object keys begin with the authenticated user UUID and a server-generated asset UUID. Storage RLS checks both bucket and first path segment against `auth.uid()`. Grant select/insert/delete only as required; do not make source photos public. Enforce consent, deletion cascading, retention cleanup and signed URL expiry in the service layer. A service-role key stays server-side only. Do not create `profiles` through an unsafe security-definer trigger; if one is used later, pin `search_path` and minimize privileges.

## Platform/video output compatibility boundary

| Platform | First milestone | Later output path | Important limit |
| --- | --- | --- | --- |
| Web | Camera input, tracking and preview in a secure context (`localhost` or HTTPS) | A MotionFace-owned call can consume a canvas `captureStream()`; browser support varies | A browser canvas stream is not a system-wide OS virtual camera and cannot be selected by arbitrary desktop apps |
| Windows | No native camera driver in browser prototype | Electron shell plus a maintained native virtual-camera implementation and signed installer | Driver install/signing, app-specific camera enumeration, permissions and Windows updates must be tested per app/OS version |
| macOS | No camera extension in browser prototype | Native Core Media I/O camera extension, with Electron only as UI shell if appropriate | Entitlements, user approval, signing/notarization and macOS version support constrain rollout |
| Android | No system camera replacement | Native app camera workflows or MotionFace-hosted calling | Do not promise arbitrary camera replacement for other apps |
| iOS | No system camera replacement | Native app and supported share/call flows | Do not promise arbitrary system-wide camera replacement |

The browser output contract may expose a `MediaStream` for MotionFace-owned WebRTC only. Native integrations remain platform-specific packages, outside the web app bundle. Build a tested app-by-app compatibility matrix before advertising external-call support.

## Technical risks and mitigations

1. **Real-time latency / three models per frame:** face, pose and hand detection can saturate CPU/GPU and block rendering. Measure inference and render timings on target devices; begin with one person, conservative resolution, single-frame inference scheduling and CPU fallback. Decouple renderer cadence from detector cadence; move inference off the UI thread if supported by the chosen delegate and verify no WebGL context conflicts. Reduce detector cadence/quality under load.
2. **Tracking-to-rig mismatch:** image-space landmarks do not directly define anatomically correct 3D bone rotations; occlusion, mirroring and perspective distort pose. Normalize coordinates, track confidence, smooth jitter, clamp rotations and display missing-track state. Start with a generic rig and limited expressive controls; do not claim realistic full-body transfer from a single still.
3. **Single-photo information loss:** unseen surfaces and occluded limbs cannot be recovered from one photograph. Keep photo preparation separate; evaluate AI image animation and multi-view/3D reconstruction as separate research tracks with quality, latency, licensing and cost tests.
4. **Model/WASM delivery and licensing:** remote model/CDN URLs can change, fail CORS or leak user usage; bundled models add payload and license obligations. Pin dependency/model versions and checksums, document attribution, and prefer self-hosted static model assets after licensing review.
5. **Browser variance and permissions:** camera access needs HTTPS/localhost and explicit permission; device selection can change and devices may be busy. Provide clear states, enumerate after permission, catch errors, stop tracks on cleanup, and retain a no-camera upload browsing mode.
6. **Virtual camera portability:** OS camera APIs, drivers, notarization and conferencing-app discovery differ. Keep adapters independent; verify one OS and app at a time; document unsupported combinations explicitly.
7. **Biometric/privacy exposure:** photos, facial landmarks and generated likenesses are sensitive. Minimize collection, process locally first, require consent, keep storage private, enforce RLS, add deletion, and never use face/body signals for analytics.

## Phase 1 implementation checklist

- [x] Inspect local workspace and connected GitHub account; confirm no MotionFace repository.
- [x] Choose a pnpm TypeScript monorepo and define package boundaries.
- [x] Check current official docs for Next.js, MediaPipe, Three.js and Supabase.
- [x] Define the future Supabase schema, RLS and private Storage rules.
- [x] Document real-time, photo reconstruction, privacy and native virtual-camera risks.
- [x] Initialize local Git and pnpm monorepo without changing unrelated repositories.
- [x] Build a responsive Next.js dashboard and image studio with validated local portrait/full-body photo preview, replacement and deletion.
- [x] Implement explicit webcam start/stop/device/error states.
- [x] Implement actual MediaPipe face, pose and hand inference, with confidence/tracking status and measured timing.
- [x] Implement Three.js renderer with a generic articulated 3D rig driven by observed tracking output; disclose that it is not the uploaded person's 3D reconstruction.
- [x] Add deterministic tests for image validation, motion normalization/smoothing/retargeting and camera error mapping.
- [x] Verify the production dashboard renders in the local browser.
- [ ] Manually verify photo selection/replacement/deletion and live camera lifecycle, tracking overlays, avatar response and cleanup with a permitted camera.
- [x] Record camera- and device-dependent checks as not verified; no browser camera permission was granted during this pass.
- [x] Add root setup documentation and run full unit suite, typecheck, lint and production build.

### Verification record (2026-11-21)

- `pnpm test`: 3 test files, 11 tests passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed; Next.js compiled, typechecked and prerendered the dashboard.
- Browser: production dashboard opened at `localhost:3000`; accessibility tree showed the Animation Studio, tracking status, camera control and consent-gated Image Studio.
- Not verified: actual camera permission, MediaPipe model downloads/inference on this device, upload interaction, tracking overlays/retargeted response, responsive breakpoints, and teardown against a physical camera. The running camera flow remains permission/device dependent.
- Environment note: Next's production server launched and rendered. `next dev` is blocked in this restricted Windows process environment (`spawn EPERM`); production build + `next start` were used for browser review.

## Official documentation references checked

- Next.js client/server component behavior: https://nextjs.org/docs/app/getting-started/server-and-client-components
- MediaPipe Tasks Vision web API: https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md
- Three.js renderer loop and GLTF loader: https://threejs.org/docs/
- Supabase RLS and Storage controls: https://supabase.com/docs/guides/database/postgres/row-level-security and https://supabase.com/docs/guides/storage/security/access-control
- pnpm workspaces: https://pnpm.io/workspaces
