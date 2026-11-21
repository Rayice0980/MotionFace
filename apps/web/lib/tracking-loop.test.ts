import { describe, expect, it, vi } from "vitest";
import { startInferenceLoop, type InferenceLoopScheduler } from "./tracking-loop";

class ManualScheduler implements InferenceLoopScheduler {
  private nextId = 1;
  private callback: ((timestamp: number) => void) | null = null;
  canceled: number[] = [];
  requestCount = 0;

  request(callback: (timestamp: number) => void) {
    this.requestCount += 1;
    this.callback = callback;
    return this.nextId++;
  }

  cancel(id: number) {
    this.canceled.push(id);
    this.callback = null;
  }

  step(timestamp: number) {
    const current = this.callback;
    this.callback = null;
    current?.(timestamp);
  }
}

describe("startInferenceLoop", () => {
  it("detects only new frames at the configured cadence and reports measured timings", () => {
    const scheduler = new ManualScheduler();
    let frameKey = 1;
    let clock = 0;
    const samples: Array<{ frame: number; inferenceMs: number; inferenceFps: number | null }> = [];
    const detect = vi.fn(() => {
      clock += 8;
      return frameKey;
    });
    startInferenceLoop({
      isReady: () => true,
      frameKey: () => frameKey,
      detect,
      onFrame: (sample) => samples.push(sample),
      onError: vi.fn(),
      scheduler,
      now: () => clock,
      minIntervalMs: 100,
    });

    scheduler.step(0);
    scheduler.step(50);
    scheduler.step(100);
    frameKey = 3;
    scheduler.step(120);

    expect(detect).toHaveBeenCalledTimes(2);
    expect(samples.map((sample) => sample.frame)).toEqual([1, 3]);
    expect(samples[0]).toMatchObject({ inferenceMs: 8, inferenceFps: null });
  });

  it("cancels the pending frame callback and never schedules another after cleanup", () => {
    const scheduler = new ManualScheduler();
    const stop = startInferenceLoop({
      isReady: () => true,
      frameKey: () => 1,
      detect: () => 1,
      onFrame: vi.fn(),
      onError: vi.fn(),
      scheduler,
    });

    stop();
    scheduler.step(16);

    expect(scheduler.canceled).toEqual([1]);
    expect(scheduler.requestCount).toBe(1);
  });

  it("reports inference failure once and stops scheduling", () => {
    const scheduler = new ManualScheduler();
    const onError = vi.fn();
    const failure = new Error("model failed");
    startInferenceLoop({
      isReady: () => true,
      frameKey: () => 1,
      detect: () => { throw failure; },
      onFrame: vi.fn(),
      onError,
      scheduler,
    });

    scheduler.step(0);
    scheduler.step(16);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(scheduler.requestCount).toBe(1);
  });

  it("publishes FPS only after measuring a full one-second sample window", () => {
    const scheduler = new ManualScheduler();
    let clock = 0;
    let frameKey = 0;
    const samples: Array<{ inferenceFps: number | null }> = [];
    startInferenceLoop({
      isReady: () => true,
      frameKey: () => frameKey,
      detect: () => ++frameKey,
      onFrame: (sample) => samples.push(sample),
      onError: vi.fn(),
      scheduler,
      now: () => clock,
      minIntervalMs: 100,
    });

    for (clock = 0; clock <= 1100; clock += 100) scheduler.step(clock);

    expect(samples[0]?.inferenceFps).toBeNull();
    expect(samples.at(-1)?.inferenceFps).toBeCloseTo(10, 0);
  });
});
