export interface ImageObjectUrlApi {
  createObjectURL: (object: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

export function createImageObjectUrlManager(api: ImageObjectUrlApi) {
  let activeUrl: string | null = null;

  function clear() {
    if (!activeUrl) return;
    api.revokeObjectURL(activeUrl);
    activeUrl = null;
  }

  return {
    create(file: Blob): string {
      clear();
      activeUrl = api.createObjectURL(file);
      return activeUrl;
    },
    clear,
    dispose: clear,
  };
}
