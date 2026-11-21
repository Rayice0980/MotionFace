import { afterEach, describe, expect, it, vi } from "vitest";
import { withMediaPipeInfoFiltered } from "./console-log-filter";

const XNNPACK_INFO = "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.";

afterEach(() => vi.restoreAllMocks());

describe("withMediaPipeInfoFiltered", () => {
  it("filters the known informational runtime line while forwarding real errors", async () => {
    const originalError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let runtimeLogger!: typeof console.error;

    await withMediaPipeInfoFiltered(async () => {
      runtimeLogger = console.error;
      console.error(XNNPACK_INFO);
      console.error("Actual model failure", new Error("failed"));
    });

    expect(originalError).toHaveBeenCalledOnce();
    expect(originalError).toHaveBeenCalledWith("Actual model failure", expect.any(Error));

    // The Emscripten runtime captures its logger during setup, then can emit
    // through that captured function while detector inference is running.
    runtimeLogger(XNNPACK_INFO);
    runtimeLogger("Actual inference failure");
    expect(originalError).toHaveBeenCalledTimes(2);
    expect(originalError).toHaveBeenLastCalledWith("Actual inference failure");
  });
});
