export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8192;

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ImageFileValidation =
  | { ok: true }
  | { ok: false; reason: "unsupported-type" | "too-large" };

export function validateImageFile(file: File): ImageFileValidation {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, reason: "unsupported-type" };
  }

  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "too-large" };
  }

  return { ok: true };
}

export function validateImageDimensions(width: number, height: number): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_IMAGE_DIMENSION &&
    height <= MAX_IMAGE_DIMENSION
  );
}

export async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);

  try {
    if (!validateImageDimensions(bitmap.width, bitmap.height)) {
      throw new Error("Image dimensions must be between 1 and 8192 pixels per side.");
    }

    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}
