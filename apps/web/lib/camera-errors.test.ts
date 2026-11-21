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

  it("explains insecure contexts and unsupported camera APIs", () => {
    expect(getCameraErrorMessage({ name: "SecurityError" })).toMatch(/https|localhost/i);
    expect(getCameraErrorMessage({ name: "NotSupportedError" })).toMatch(/browser/i);
  });

  it("handles DOM exceptions from another realm by their error name", () => {
    expect(getCameraErrorMessage({ name: "NotAllowedError" })).toMatch(/permission/i);
    expect(getCameraErrorMessage({ name: "DeviceDisconnectedError" })).toMatch(/disconnected/i);
  });

  it("provides a useful fallback for unknown failures", () => {
    expect(getCameraErrorMessage(new Error("unknown"))).toMatch(/camera/i);
  });
});
