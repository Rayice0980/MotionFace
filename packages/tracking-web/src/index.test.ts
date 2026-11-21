import { describe, expect, it, vi } from "vitest";
import { createTracker, TrackingEngineError, type TrackerFactories } from "./index";

function makeFactories(overrides: Partial<TrackerFactories> = {}) {
  const face = {
    detectForVideo: vi.fn(() => ({ faceLandmarks: [], faceBlendshapes: [] })),
    close: vi.fn(),
  };
  const pose = { detectForVideo: vi.fn(() => ({ landmarks: [] })), close: vi.fn() };
  const hands = { detectForVideo: vi.fn(() => ({ landmarks: [], handedness: [] })), close: vi.fn() };
  const factories = {
    loadFileset: vi.fn(async () => ({})),
    createFace: vi.fn(async () => face),
    createPose: vi.fn(async () => pose),
    createHands: vi.fn(async () => hands),
    ...overrides,
  } as unknown as TrackerFactories;
  return { factories, face, pose, hands };
}

describe("createTracker", () => {
  it("closes already loaded models when a later model fails to initialize", async () => {
    const failure = new Error("model file unavailable");
    const { factories, face } = makeFactories({ createPose: async () => { throw failure; } });

    await expect(createTracker(factories)).rejects.toMatchObject({
      name: "TrackingEngineError",
      phase: "pose",
    });
    expect(face.close).toHaveBeenCalledOnce();
  });

  it("closes face and body models when hand model loading fails", async () => {
    const { factories, face, pose } = makeFactories({ createHands: async () => { throw new Error("hand model unavailable"); } });

    await expect(createTracker(factories)).rejects.toMatchObject({ phase: "hands" });

    expect(face.close).toHaveBeenCalledOnce();
    expect(pose.close).toHaveBeenCalledOnce();
  });

  it("reports a runtime setup failure before attempting to initialize detectors", async () => {
    const failure = new Error("WASM files unavailable");
    const { factories, face } = makeFactories({ loadFileset: async () => { throw failure; } });

    await expect(createTracker(factories)).rejects.toMatchObject({
      phase: "runtime",
      message: expect.stringMatching(/runtime/i),
    });
    expect(face.close).not.toHaveBeenCalled();
  });

  it("closes every detector even if one close operation fails, and stays idempotent", async () => {
    const { factories, face, pose, hands } = makeFactories();
    face.close.mockImplementation(() => { throw new Error("face close failed"); });
    const tracker = await createTracker(factories);

    expect(() => tracker.close()).not.toThrow();
    tracker.close();

    expect(face.close).toHaveBeenCalledOnce();
    expect(pose.close).toHaveBeenCalledOnce();
    expect(hands.close).toHaveBeenCalledOnce();
  });

  it("identifies inference errors and rejects use after close", async () => {
    const failure = new Error("frame inference failed");
    const { factories, face } = makeFactories();
    face.detectForVideo.mockImplementation(() => { throw failure; });
    const tracker = await createTracker(factories);
    const video = {} as HTMLVideoElement;

    expect(() => tracker.detect(video, 10)).toThrowError(TrackingEngineError);
    expect(() => tracker.detect(video, 10)).toThrow(/inference/i);
    tracker.close();
    expect(() => tracker.detect(video, 11)).toThrow(/closed/i);
  });
});
