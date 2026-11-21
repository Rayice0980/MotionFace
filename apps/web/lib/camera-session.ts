import { getCameraErrorMessage } from "./camera-errors";

export type CameraStatus = "idle" | "requesting" | "live" | "error";
export type CameraPermission = "unknown" | "prompt" | "granted" | "denied";
export type CameraDeviceDetails = Pick<MediaDeviceInfo, "deviceId" | "label" | "kind">;
export type CameraStream = Pick<MediaStream, "getTracks" | "getVideoTracks">;

export interface CameraMediaDevices {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<CameraStream>;
  enumerateDevices?: () => Promise<CameraDeviceDetails[]>;
  addEventListener?: (type: "devicechange", listener: EventListener) => void;
  removeEventListener?: (type: "devicechange", listener: EventListener) => void;
}

export interface CameraSessionSnapshot {
  stream: CameraStream | null;
  devices: CameraDeviceDetails[];
  activeDeviceId: string;
  status: CameraStatus;
  permission: CameraPermission;
  error: string;
}

const INITIAL_STATE: CameraSessionSnapshot = {
  stream: null,
  devices: [],
  activeDeviceId: "",
  status: "idle",
  permission: "unknown",
  error: "",
};

export class CameraSession {
  private snapshot: CameraSessionSnapshot = INITIAL_STATE;
  private readonly listeners = new Set<(snapshot: CameraSessionSnapshot) => void>();
  private requestId = 0;
  private mounted = false;
  private disposed = false;
  private stream: CameraStream | null = null;
  private readonly trackEndListeners = new Map<MediaStreamTrack, EventListener>();
  private readonly handleDeviceChange: EventListener = () => {
    void this.refreshDevices(true);
  };

  constructor(
    private readonly mediaDevices?: CameraMediaDevices | null,
    private readonly readPermission?: () => Promise<CameraPermission>,
  ) {}

  getSnapshot = (): CameraSessionSnapshot => this.snapshot;

  subscribe = (listener: (snapshot: CameraSessionSnapshot) => void): (() => void) => {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  };

  mount(): void {
    if (this.mounted || this.disposed) return;
    this.mounted = true;
    this.mediaDevices?.addEventListener?.("devicechange", this.handleDeviceChange);
    void this.refreshPermission();
  }

  async start(deviceId?: string): Promise<void> {
    if (this.disposed) return;
    const requestId = ++this.requestId;
    this.releaseStream();
    this.update({ stream: null, activeDeviceId: "", error: "", status: "requesting" });

    try {
      // Do not put the Permissions API in front of getUserMedia. Its result can be
      // stale or unsupported, and the camera request should start directly from
      // the user's click. getUserMedia is the authoritative permission check.
      if (!this.mediaDevices?.getUserMedia) throw { name: "NotSupportedError" };

      const stream = await this.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
      });

      if (requestId !== this.requestId || this.disposed) {
        this.stopTracks(stream);
        return;
      }

      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0) {
        this.stopTracks(stream);
        throw { name: "NotFoundError" };
      }

      this.stream = stream;
      for (const track of videoTracks) {
        const onEnded: EventListener = () => this.handleTrackEnded(stream);
        this.trackEndListeners.set(track, onEnded);
        track.addEventListener("ended", onEnded);
      }

      const selectedDeviceId = videoTracks[0]?.getSettings().deviceId ?? deviceId ?? "";
      this.update({
        stream,
        activeDeviceId: selectedDeviceId,
        status: "live",
        permission: "granted",
        error: "",
      });
      void this.refreshDevices();
    } catch (error) {
      if (requestId !== this.requestId || this.disposed) return;
      this.releaseStream();
      const errorName = typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
        ? error.name
        : "";
      this.update({
        stream: null,
        activeDeviceId: "",
        status: "error",
        error: getCameraErrorMessage(error),
        ...(errorName === "NotAllowedError" ? { permission: "denied" as const } : {}),
      });
    }
  }

  stop(): void {
    if (this.disposed) return;
    this.requestId += 1;
    this.releaseStream();
    this.update({ stream: null, activeDeviceId: "", status: "idle", error: "" });
  }

  dispose(): void {
    if (this.disposed) return;
    this.requestId += 1;
    this.disposed = true;
    this.mediaDevices?.removeEventListener?.("devicechange", this.handleDeviceChange);
    this.releaseStream();
    this.listeners.clear();
  }

  private async refreshPermission(): Promise<void> {
    const requestId = this.requestId;
    const permission = await this.readPermissionSafely();
    if (!this.disposed && requestId === this.requestId && permission !== "unknown") this.update({ permission });
  }

  private async readPermissionSafely(): Promise<CameraPermission> {
    if (!this.readPermission) return "unknown";
    try {
      return await this.readPermission();
    } catch {
      // The Permissions API is not implemented consistently; getUserMedia remains the source of truth.
      return "unknown";
    }
  }

  private async refreshDevices(checkActiveDevice = false): Promise<void> {
    if (this.disposed || !this.mediaDevices?.enumerateDevices) return;
    try {
      const devices = (await this.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
          kind: device.kind,
        }));
      if (this.disposed) return;
      this.update({ devices });

      if (checkActiveDevice && this.snapshot.activeDeviceId && !devices.some(({ deviceId }) => deviceId === this.snapshot.activeDeviceId)) {
        this.handleDisconnectedStream();
      }
    } catch {
      // Keep the last known list; enumeration can be blocked even while capture works.
    }
  }

  private handleTrackEnded(stream: CameraStream): void {
    if (this.stream !== stream || this.disposed) return;
    this.requestId += 1;
    this.releaseStream();
    this.update({ stream: null, activeDeviceId: "", status: "error", error: getCameraErrorMessage({ name: "DeviceDisconnectedError" }) });
  }

  private handleDisconnectedStream(): void {
    if (!this.stream || this.disposed) return;
    this.requestId += 1;
    this.releaseStream();
    this.update({ stream: null, activeDeviceId: "", status: "error", error: getCameraErrorMessage({ name: "DeviceDisconnectedError" }) });
  }

  private releaseStream(): void {
    if (!this.stream) return;
    for (const [track, listener] of this.trackEndListeners) {
      try {
        track.removeEventListener("ended", listener);
      } catch {
        // A browser may already have released a disconnected track.
      }
    }
    this.trackEndListeners.clear();
    const stream = this.stream;
    this.stream = null;
    this.stopTracks(stream);
  }

  private stopTracks(stream: CameraStream): void {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // A browser may report a track as ended while teardown is already in progress.
      }
    });
  }

  private update(patch: Partial<CameraSessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}
