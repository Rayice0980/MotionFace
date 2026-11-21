import { describe, expect, it } from "vitest";
import { mapTrackingToRig, smoothValue } from "./index";

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
});
