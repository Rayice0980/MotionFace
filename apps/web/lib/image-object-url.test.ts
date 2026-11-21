import { describe, expect, it, vi } from "vitest";
import { createImageObjectUrlManager } from "./image-object-url";

describe("createImageObjectUrlManager", () => {
  it("keeps the selected preview URL alive until replacement, clear, or unmount", () => {
    const createObjectURL = vi.fn()
      .mockReturnValueOnce("blob:portrait")
      .mockReturnValueOnce("blob:replacement");
    const revokeObjectURL = vi.fn();
    const manager = createImageObjectUrlManager({ createObjectURL, revokeObjectURL });
    const firstFile = new Blob(["portrait"], { type: "image/png" });
    const secondFile = new Blob(["replacement"], { type: "image/png" });

    expect(manager.create(firstFile)).toBe("blob:portrait");
    expect(revokeObjectURL).not.toHaveBeenCalled();

    expect(manager.create(secondFile)).toBe("blob:replacement");
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenLastCalledWith("blob:portrait");

    manager.clear();
    manager.dispose();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenLastCalledWith("blob:replacement");
  });
});
