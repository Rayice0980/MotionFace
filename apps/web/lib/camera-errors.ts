export function getCameraErrorMessage(error: unknown): string {
  const name =
    typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
      ? error.name
      : "";

  switch (name) {
    case "NotAllowedError":
      return "Camera permission was denied. Allow camera access in your browser settings and try again.";
    case "SecurityError":
      return "Camera access requires a secure page (HTTPS or localhost). Check the browser's site permissions and try again.";
    case "NotFoundError":
      return "No camera was found. Connect a camera or choose another device.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is already in use by another app. Close that app and try again.";
    case "OverconstrainedError":
      return "That camera is unavailable. Choose another device and try again.";
    case "NotSupportedError":
      return "Camera capture is unavailable in this browser or page context. Use a current browser over HTTPS or localhost, then try again.";
    case "DeviceDisconnectedError":
      return "The camera disconnected. Reconnect it or choose another camera, then try again.";
    default:
      return "The camera could not start. Check that a camera is connected, allow browser access, and close other apps using it.";
  }
}
