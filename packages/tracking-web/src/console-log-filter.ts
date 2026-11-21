const XNNPACK_INFO_PREFIX = "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.";

let activeInitializers = 0;
let originalConsoleError: typeof console.error | null = null;
let filteredConsoleError: typeof console.error | null = null;

/**
 * MediaPipe's Emscripten runtime binds `console.error` as its stderr writer
 * while loading WASM. TensorFlow Lite writes an INFO-level XNNPACK message to
 * stderr, which Next.js development treats as a runtime console error. Filter
 * only that exact informational prefix while the runtime is initialized; the
 * WASM writer retains this narrow filter for later inference calls.
 */
export async function withMediaPipeInfoFiltered<T>(initialize: () => Promise<T>): Promise<T> {
  if (activeInitializers === 0) {
    const previousConsoleError = console.error;
    originalConsoleError = previousConsoleError;
    filteredConsoleError = (...args: unknown[]) => {
      const firstArgument = args[0];
      if (typeof firstArgument === "string" && firstArgument.startsWith(XNNPACK_INFO_PREFIX)) return;
      previousConsoleError.apply(console, args);
    };
    console.error = filteredConsoleError;
  }

  activeInitializers += 1;
  try {
    return await initialize();
  } finally {
    activeInitializers -= 1;
    if (activeInitializers === 0 && console.error === filteredConsoleError) {
      console.error = originalConsoleError ?? console.error;
      originalConsoleError = null;
      filteredConsoleError = null;
    }
  }
}
