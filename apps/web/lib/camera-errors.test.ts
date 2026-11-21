import { describe, expect, it } from "vitest";
import { getCameraErrorMessage } from "./camera-errors";

describe("getCameraErrorMessage", () => {
  it("explains camera permission denial", () => {
    expect(getCameraErrorMessage(new DOMException("blocked", "NotAllowedError"))).toMatch(/permission/i);
  });

  it("explains a missing camera and a busy camera", () => {
    expect(getCameraErrorMessage(new DOMException("missing", "NotFoundError"))).toMatch(/camera/i);
    expect(getCameraErrorMessage(new DOMException("busy", "NotReadableError"))).toMatch(/in use/i);
  });

  it("provides a useful fallback for unknown failures", () => {
    expect(getCameraErrorMessage(new Error("unknown"))).toMatch(/camera/i);
  });
});
