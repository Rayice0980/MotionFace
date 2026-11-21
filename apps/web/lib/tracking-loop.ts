export interface InferenceLoopScheduler {
  request(callback: (timestamp: number) => void): number;
  cancel(id: number): void;
}

export interface InferenceSample<T> {
  frame: T;
  inferenceMs: number;
  inferenceFps: number | null;
}

export interface InferenceLoopOptions<T> {
  isReady: () => boolean;
  frameKey: () => number;
  detect: (timestamp: number) => T;
  onFrame: (sample: InferenceSample<T>) => void;
  onError: (error: unknown) => void;
  scheduler: InferenceLoopScheduler;
  now?: () => number;
  minIntervalMs?: number;
}

export function createVideoFrameScheduler(video: HTMLVideoElement): InferenceLoopScheduler {
  if (video.requestVideoFrameCallback && video.cancelVideoFrameCallback) {
    return {
      request: (callback) => video.requestVideoFrameCallback((timestamp) => callback(timestamp)),
      cancel: (id) => video.cancelVideoFrameCallback(id),
    };
  }

  return {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  };
}

export function startInferenceLoop<T>(options: InferenceLoopOptions<T>): () => void {
  const now = options.now ?? (() => performance.now());
  const minIntervalMs = options.minIntervalMs ?? 100;
  let running = true;
  let callbackId: number | null = null;
  let lastFrameKey: number | null = null;
  let lastAttemptAt = Number.NEGATIVE_INFINITY;
  let sampleStartAt: number | null = null;
  let sampleCount = 0;
  let measuredFps: number | null = null;

  const tick = (scheduleTime: number) => {
    callbackId = null;
    if (!running) return;

    const nextFrameKey = options.frameKey();
    if (
      options.isReady() &&
      nextFrameKey !== lastFrameKey &&
      scheduleTime - lastAttemptAt >= minIntervalMs
    ) {
      lastFrameKey = nextFrameKey;
      lastAttemptAt = scheduleTime;
      const startedAt = now();

      try {
        const frame = options.detect(startedAt);
        const finishedAt = now();
        const inferenceMs = Math.max(0, finishedAt - startedAt);

        if (sampleStartAt === null) {
          sampleStartAt = finishedAt;
          sampleCount = 1;
        } else {
          sampleCount += 1;
          const sampleDuration = finishedAt - sampleStartAt;
          if (sampleDuration >= 1000) {
            measuredFps = ((sampleCount - 1) * 1000) / sampleDuration;
            sampleStartAt = finishedAt;
            sampleCount = 1;
          }
        }

        options.onFrame({ frame, inferenceMs, inferenceFps: measuredFps });
      } catch (error) {
        running = false;
        options.onError(error);
        return;
      }
    }

    if (running) callbackId = options.scheduler.request(tick);
  };

  callbackId = options.scheduler.request(tick);
  return () => {
    if (!running) return;
    running = false;
    if (callbackId !== null) options.scheduler.cancel(callbackId);
    callbackId = null;
  };
}
