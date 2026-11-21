export function getCameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission was denied. Allow camera access in your browser settings and try again.";
    case "NotFoundError":
      return "No camera was found. Connect a camera or choose another device.";
    case "NotReadableError":
      return "The camera is already in use by another app. Close that app and try again.";
    case "OverconstrainedError":
      return "That camera is unavailable. Choose another device and try again.";
    default:
      return "The camera could not start. Check your browser permissions and try again.";
  }
}
