import { beforeEach, describe, expect, it, vi } from "vitest";

const hookHarness = vi.hoisted(() => ({
  slots: [] as unknown[],
  effects: [] as Array<{ deps: unknown[] | undefined; cleanup?: () => void } | undefined>,
  cursor: 0,
}));

vi.mock("react", () => ({
  useState<T>(initial: T) {
    const index = hookHarness.cursor++;
    if (!(index in hookHarness.slots)) hookHarness.slots[index] = initial;
    return [hookHarness.slots[index], (next: T | ((current: T) => T)) => {
      const current = hookHarness.slots[index] as T;
      hookHarness.slots[index] = typeof next === "function" ? (next as (current: T) => T)(current) : next;
    }];
  },
  useRef<T>(initial: T) {
    const index = hookHarness.cursor++;
    if (!(index in hookHarness.slots)) hookHarness.slots[index] = { current: initial };
    return hookHarness.slots[index];
  },
  useEffect(effect: () => void | (() => void), deps?: unknown[]) {
    const index = hookHarness.cursor++;
    const previous = hookHarness.effects[index];
    const changed = !previous || deps === undefined || previous.deps === undefined ||
      deps.length !== previous.deps.length || deps.some((value, depIndex) => !Object.is(value, previous.deps?.[depIndex]));
    if (!changed) return;
    previous?.cleanup?.();
    const result = effect();
    hookHarness.effects[index] = { deps, cleanup: typeof result === "function" ? result : undefined };
  },
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => ({ type: "img", props }),
}));

vi.mock("@/lib/image-validation", () => ({
  readImageDimensions: async () => ({ width: 320, height: 240 }),
  validateImageFile: () => ({ ok: true }),
}));

import { ImageStudio } from "./image-studio";

type ElementNode = { type: unknown; props: Record<string, unknown> };

function findElement(node: unknown, predicate: (element: ElementNode) => boolean): ElementNode | null {
  if (!node || typeof node !== "object") return null;
  const element = node as ElementNode;
  if (predicate(element)) return element;
  if (typeof element.type === "function") {
    return findElement((element.type as (props: Record<string, unknown>) => unknown)(element.props), predicate);
  }
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

function renderStudio() {
  hookHarness.cursor = 0;
  return ImageStudio();
}

describe("ImageStudio", () => {
  beforeEach(() => {
    hookHarness.slots = [];
    hookHarness.effects = [];
    hookHarness.cursor = 0;
  });

  it("keeps a selected photo preview URL alive across component rerenders", async () => {
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:motionface-preview");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const bitmap = { width: 320, height: 240, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));

    let tree = renderStudio();
    const consent = findElement(tree, (element) => element.type === "input" && element.props.type === "checkbox");
    expect(consent).not.toBeNull();
    (consent?.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    tree = renderStudio();

    const fileInput = findElement(tree, (element) => element.type === "input" && element.props.type === "file");
    const file = new File(["image"], "portrait.png", { type: "image/png" });
    (fileInput?.props.onChange as (event: { currentTarget: { files: File[]; value: string } }) => void)({ currentTarget: { files: [file], value: "portrait.png" } });
    await Promise.resolve();
    await Promise.resolve();
    tree = renderStudio();

    const preview = findElement(tree, (element) => element.type === "img" && element.props.alt === "Portrait photo preview");
    expect(preview?.props.src).toBe("blob:motionface-preview");
    expect(createUrl).toHaveBeenCalledWith(file);
    expect(revokeUrl).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
