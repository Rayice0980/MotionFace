# MotionFace Browser Milestone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the MotionFace pnpm monorepo and deliver a browser prototype with local photo preparation, webcam tracking for face/pose/hands, and a generic 3D avatar driven by actual tracking results.

**Architecture:** Next.js owns the responsive dashboard and browser permission lifecycle. MediaPipe is isolated behind a tracking adapter; pure TypeScript motion transforms are separately tested; Three.js renders a clearly labeled generic rig. The uploaded photo remains an independent preview until a real single-photo reconstruction or image animation model is evaluated.

**Tech Stack:** pnpm workspaces, Next.js App Router, React, TypeScript, MediaPipe Tasks Vision, Three.js, Vitest.

**Spec:** `docs/architecture/technical-foundation.md`; pasted MotionFace master specification sections 7, 9, 10, 13 and 14.

## Global Constraints

- The first milestone is browser-based and must not promise universal virtual-camera compatibility.
- A 2D photograph is not a complete 3D person; no fake AI animation claim.
- Camera permission is explicit; stop tracks and revoke image object URLs on every teardown path.
- Do not send images, frames, or face/body landmarks to a server in the local prototype.
- Keep secrets out of source; no Supabase, billing, analytics, remote AI, or native camera dependency in the first milestone.
- Preserve package boundaries: UI, tracking adapters, pure motion logic, renderer, and platform output.

## Review Focus

- Invalid, oversized, unsupported, or unreadable image: reject with a useful message and preserve the previous selection.
- Camera denial, missing camera, busy device, and device-switch failure: show recoverable status and release any partially acquired stream.
- No face/pose/hand detected or confidence loss: represent absence explicitly; never leave stale tracking presented as live.
- Low device performance or MediaPipe failure: stop inference safely and keep the page responsive; don't claim stable real-time performance.
- Route unmount, stop, and photo replacement: stop every camera track, close model instances, cancel animation loops and revoke URLs.

---

### Task 1: Monorepo foundation and shell

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/globals.css`
- Create: `packages/motion-core/package.json`, `packages/motion-core/src/index.ts`
- Test: root package scripts for lint/typecheck/build

**Interfaces:**
- Produces: `@motionface/motion-core` import boundary and `apps/web` running on localhost.

- [x] Create the workspace manifests and resolve/pin package versions in the lockfile.
- [x] Add the MotionFace dark dashboard shell with responsive nav/sidebar and truthful disabled/ready states.
- [x] Run the Next production build and TypeScript checks.

### Task 2: Local image studio

**Files:**
- Create: `apps/web/components/image-studio.tsx`, `apps/web/lib/image-validation.ts`
- Test: `apps/web/lib/image-validation.test.ts`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- `validateImage(file: File) -> Promise<{ width: number; height: number }>` validates supported image MIME, maximum 12 MiB, decodability and dimensions.
- UI accepts explicit portrait/full-body mode; source image is retained as an in-memory object URL only.

- [x] Add tests for supported type/size/dimensions and invalid files; object URL lifecycle is implemented in the component.
- [x] Implement drag/drop and file picker, local preview, replace, clear/delete, explicit consent assertion, and accessible controls.
- [x] Run the image validation suite and app typecheck/build.

### Task 3: Real camera lifecycle and tracking contracts

**Files:**
- Create: `packages/motion-core/src/tracking.ts`, `packages/motion-core/src/smoothing.ts`, `packages/motion-core/src/retarget.ts`
- Test: `packages/motion-core/src/*.test.ts`
- Create: `packages/tracking-web/package.json`, `packages/tracking-web/src/mediapipe-tracker.ts`
- Create: `apps/web/components/camera-studio.tsx`, `apps/web/hooks/use-camera.ts`

**Interfaces:**
- `TrackingFrame` contains timestamp and optional face/pose/hands with confidence; absence remains `null`.
- `createTracker(options): Promise<Tracker>`; `Tracker.detect(video, timestamp): TrackingFrame`; `Tracker.close(): void`.
- `smoothMotion(previous, next, alpha)` and `mapTrackingToRig(frame)` remain deterministic/pure.

- [x] Add unit tests for coordinate normalization, smoothing stability, angle clamping and empty inputs; verify failure before implementation.
- [x] Implement explicit `getUserMedia`, device listing after permission, device switching, stop and cleanup.
- [x] Load actual MediaPipe face, pose and hand tasks in VIDEO mode; record inference timing and model-load/error state.
- [x] Run unit tests, typecheck and build; production UI contains no mocked camera result.

### Task 4: Three.js generic rig driven by tracking

**Files:**
- Create: `packages/avatar-three/package.json`, `packages/avatar-three/src/avatar-scene.ts`
- Create: `apps/web/components/avatar-preview.tsx`
- Modify: `apps/web/components/camera-studio.tsx`

**Interfaces:**
- `AvatarScene.mount(canvas)`, `AvatarScene.apply(frame)`, `AvatarScene.resize(width, height)`, `AvatarScene.dispose()`.
- Consumes normalized `TrackingFrame`; displays actual face/head/torso/limb/hand cues supported by the generic rig.

- [x] Implement renderer setup with `WebGLRenderer.setAnimationLoop`, resize observer and GPU resource disposal.
- [x] Create a generic articulated rig and map tracked head/pose/hand results into rotations/controls; face expression scores drive available rig features.
- [x] Add clear disclosure that the avatar is generic and the photo has not been reconstructed.
- [ ] Camera-driven avatar response and missing-track reset behavior remain unverified without granting a browser camera permission.

### Task 5: Integration and browser verification

**Files:**
- Modify: UI/status, errors, accessibility and docs as needed.
- Test: unit suite, production build, browser manual verification.

- [x] Add camera, tracking, inference timing/FPS and renderer status indicators based on runtime state.
- [x] Run the full unit suite, lint/typecheck and production build.
- [ ] Manually verify image file selection/replacement/deletion, live camera lifecycle, face/pose/hand states, avatar response, responsive behavior and cleanup in a supported browser.
- [x] Document browser prerequisites and environment/device checks that remain unverified.
