import { describe, expect, it } from "vitest";
import { mapTrackingToRig, smoothTrackingFrame, smoothValue } from "./index";

describe("motion core", () => {
  it("maps live face landmarks and expressions into bounded rig controls", () => {
    const faceLandmarks = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    faceLandmarks[33] = { x: 0.4, y: 0.4, z: 0 };
    faceLandmarks[263] = { x: 0.6, y: 0.42, z: 0 };
    faceLandmarks[1] = { x: 0.8, y: 0.58, z: 0 };

    const result = mapTrackingToRig({
      timestamp: 100,
      face: {
        landmarks: faceLandmarks,
        blendshapes: { jawOpen: 1.5, mouthSmileLeft: 0.7, mouthSmileRight: 0.9 },
      },
      pose: null,
      hands: [],
    });

    expect(result.face?.rotation.y).toBe(0.85);
    expect(result.face?.expression.jawOpen).toBe(1);
    expect(result.face?.expression.smile).toBeCloseTo(0.8);
    expect(result.pose).toBeNull();
  });

  it("keeps absent pose and hands absent instead of fabricating motion", () => {
    const result = mapTrackingToRig({ timestamp: 1, face: null, pose: null, hands: [] });

    expect(result).toEqual({ face: null, pose: null, hands: [] });
  });

  it("smooths values and clamps interpolation strength", () => {
    expect(smoothValue(0, 1, 0.25)).toBe(0.25);
    expect(smoothValue(0, 1, 4)).toBe(1);
    expect(smoothValue(null, 2, 0.25)).toBe(2);
  });

  it("smooths matched landmarks and expressions without changing the current timestamp", () => {
    const previous = {
      timestamp: 100,
      face: { landmarks: [{ x: 0, y: 0, z: 0 }], blendshapes: { jawOpen: 0.2 } },
      pose: [{ x: 0, y: 0, z: 0, visibility: 0.5 }],
      hands: [{ handedness: "Left" as const, landmarks: [{ x: 0, y: 0, z: 0 }] }],
    };
    const current = {
      timestamp: 200,
      face: { landmarks: [{ x: 1, y: 0.5, z: 2 }], blendshapes: { jawOpen: 0.6 } },
      pose: [{ x: 1, y: 0.5, z: 2, visibility: 1 }],
      hands: [{ handedness: "Left" as const, landmarks: [{ x: 1, y: 0.5, z: 2 }] }],
    };

    const result = smoothTrackingFrame(previous, current, 0.25);

    expect(result.timestamp).toBe(200);
    expect(result.face?.landmarks[0]).toEqual({ x: 0.25, y: 0.125, z: 0.5 });
    expect(result.face?.blendshapes.jawOpen).toBeCloseTo(0.3);
    expect(result.pose?.[0]).toEqual({ x: 0.25, y: 0.125, z: 0.5, visibility: 0.625 });
    expect(result.hands[0]?.landmarks[0]).toEqual({ x: 0.25, y: 0.125, z: 0.5 });
  });

  it("drops missing tracks immediately instead of holding stale landmarks", () => {
    const previous = {
      timestamp: 100,
      face: { landmarks: [{ x: 0.2, y: 0.3, z: 0 }], blendshapes: {} },
      pose: [{ x: 0.2, y: 0.3, z: 0 }],
      hands: [{ handedness: "Right" as const, landmarks: [{ x: 0.2, y: 0.3, z: 0 }] }],
    };

    expect(smoothTrackingFrame(previous, { timestamp: 200, face: null, pose: null, hands: [] }, 0.5))
      .toEqual({ timestamp: 200, face: null, pose: null, hands: [] });
  });
});
