import { describe, expect, it } from "vitest";
import { validateImageDimensions, validateImageFile } from "./image-validation";

describe("validateImageFile", () => {
  it("accepts supported image files under the size limit", () => {
    const file = new File([new Uint8Array(16)], "portrait.png", {
      type: "image/png",
    });

    expect(validateImageFile(file)).toEqual({ ok: true });
  });

  it("rejects non-image files", () => {
    const file = new File(["not an image"], "avatar.exe", {
      type: "application/octet-stream",
    });

    expect(validateImageFile(file)).toEqual({ ok: false, reason: "unsupported-type" });
  });

  it("rejects images larger than 12 MiB", () => {
    const file = new File([new Uint8Array(12 * 1024 * 1024 + 1)], "large.jpg", {
      type: "image/jpeg",
    });

    expect(validateImageFile(file)).toEqual({ ok: false, reason: "too-large" });
  });

  it("rejects empty or excessively large decoded dimensions", () => {
    expect(validateImageDimensions(0, 800)).toBe(false);
    expect(validateImageDimensions(9000, 6000)).toBe(false);
  });

  it("accepts positive dimensions within the decode limit", () => {
    expect(validateImageDimensions(1920, 1080)).toBe(true);
  });
});
