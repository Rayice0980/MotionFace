# MotionFace Phase 2: Camera & Tracking Validation

**Goal:** Make webcam and MediaPipe tracking behavior recoverable, measurable and cleanly disposable while preserving the browser prototype boundaries.

**Out of scope:** AI photo animation/reconstruction, backend persistence, system virtual-camera drivers and additional runtime dependencies.

## Work checklist

- [x] Inspect Phase 1 branch, clean worktree, README, architecture, plan and current camera/tracking implementation.
- [x] Improve camera permission feedback, browser/context failures, missing devices, device switching and disconnect handling.
- [x] Stop tracks after user stop, page hide, component unmount, canceled startup and teardown edge cases.
- [x] Add regression tests for camera acquisition, permissions, device errors, track teardown and disconnects.
- [x] Close partially initialized MediaPipe models and make tracker cleanup idempotent and best effort.
- [x] Cap inference to new video frames at 10 Hz, report measured execution time/FPS and cancel the scheduling loop on cleanup/errors.
- [x] Smooth observed landmarks/blendshapes and clear lost tracks immediately.
- [x] Show independent face/body/hand states and actionable camera/model messages in the responsive dashboard.
- [x] Run the full unit suite (35 tests), TypeScript check, lint and production build.
- [ ] Verify camera permission, device switching and live tracking with a physical camera; permission was not granted as part of automated tests.
