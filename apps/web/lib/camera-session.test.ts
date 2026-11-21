import { describe, expect, it, vi } from "vitest";
import { CameraSession, type CameraDeviceDetails, type CameraStream } from "./camera-session";

class FakeTrack {
  readyState = "live";
  stopped = 0;
  settings: { deviceId: string };
  private endedListeners = new Set<() => void>();

  constructor(deviceId = "camera-1") {
    this.settings = { deviceId };
  }

  getSettings() { return this.settings; }
  addEventListener(_type: "ended", listener: () => void) { this.endedListeners.add(listener); }
  removeEventListener(_type: "ended", listener: () => void) { this.endedListeners.delete(listener); }
  stop() { this.stopped += 1; this.readyState = "ended"; }
  disconnect() {
    this.readyState = "ended";
    this.endedListeners.forEach((listener) => listener());
  }
}

function makeStream(track = new FakeTrack()): CameraStream & { track: FakeTrack } {
  return {
    track,
    getTracks: () => [track] as unknown as MediaStreamTrack[],
    getVideoTracks: () => [track] as unknown as MediaStreamTrack[],
  };
}

function makeDevice(deviceId: string, label: string): CameraDeviceDetails {
  return { deviceId, label, kind: "videoinput" } as CameraDeviceDetails;
}

function makeMediaDevices(options: {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<CameraStream>;
  devices?: CameraDeviceDetails[];
}) {
  const listeners = new Set<EventListener>();
  const getUserMedia = vi.fn(options.getUserMedia ?? (async () => makeStream()));
  const provider = {
    getUserMedia,
    enumerateDevices: vi.fn(async () => options.devices ?? [makeDevice("camera-1", "Front camera")]),
    addEventListener: (_type: "devicechange", listener: EventListener) => { listeners.add(listener); },
    removeEventListener: (_type: "devicechange", listener: EventListener) => { listeners.delete(listener); },
    disconnectDevice: () => listeners.forEach((listener) => listener(new Event("devicechange"))),
  };
  return provider;
}

describe("CameraSession", () => {
  it("explains when this browser does not expose camera capture", async () => {
    const session = new CameraSession(null);

    await session.start();

    expect(session.getSnapshot().status).toBe("error");
    expect(session.getSnapshot().error).toMatch(/browser/i);
  });

  it("uses getUserMedia as the permission source of truth instead of blocking on a stale Permissions API denial", async () => {
    const stream = makeStream();
    const media = makeMediaDevices({ getUserMedia: async () => stream });
    const session = new CameraSession(media, async () => "denied");

    await session.start();

    expect(media.getUserMedia).toHaveBeenCalledOnce();
    expect(session.getSnapshot()).toMatchObject({ stream, status: "live", permission: "granted" });
  });

  it("records a permission denial returned by getUserMedia so the UI can show recovery steps", async () => {
    const session = new CameraSession(makeMediaDevices({
      getUserMedia: async () => { throw new DOMException("blocked", "NotAllowedError"); },
    }));

    await session.start();

    expect(session.getSnapshot()).toMatchObject({ permission: "denied", status: "error" });
    expect(session.getSnapshot().error).toMatch(/permission/i);
  });

  it("reports when there is no available video input", async () => {
    const session = new CameraSession(makeMediaDevices({
      getUserMedia: async () => { throw new DOMException("missing", "NotFoundError"); },
    }));

    await session.start();

    expect(session.getSnapshot().error).toMatch(/no camera/i);
  });

  it("stops an unusable stream that contains no video track", async () => {
    const audioOnly = makeStream();
    const session = new CameraSession(makeMediaDevices({
      getUserMedia: async () => ({ getTracks: audioOnly.getTracks, getVideoTracks: () => [] }),
    }));

    await session.start();

    expect(audioOnly.track.stopped).toBe(1);
    expect(session.getSnapshot().status).toBe("error");
    expect(session.getSnapshot().error).toMatch(/no camera/i);
  });

  it("releases the camera track when the user stops the session", async () => {
    const stream = makeStream();
    const session = new CameraSession(makeMediaDevices({ getUserMedia: async () => stream }));
    await session.start();

    session.stop();

    expect(stream.track.stopped).toBe(1);
    expect(session.getSnapshot()).toMatchObject({ stream: null, activeDeviceId: "", status: "idle" });
  });

  it("releases every track during teardown even if one stop operation throws", async () => {
    const first = new FakeTrack();
    const second = new FakeTrack("camera-2");
    first.stop = () => { first.stopped += 1; throw new Error("already ended"); };
    const stream = {
      getTracks: () => [first, second] as unknown as MediaStreamTrack[],
      getVideoTracks: () => [first, second] as unknown as MediaStreamTrack[],
    } as CameraStream;
    const session = new CameraSession(makeMediaDevices({ getUserMedia: async () => stream }));
    await session.start();

    expect(() => session.dispose()).not.toThrow();
    expect(first.stopped).toBe(1);
    expect(second.stopped).toBe(1);
  });

  it("stops a stream that resolves after the camera request was canceled", async () => {
    let resolveRequest!: (stream: CameraStream) => void;
    const pending = new Promise<CameraStream>((resolve) => { resolveRequest = resolve; });
    const media = makeMediaDevices({ getUserMedia: () => pending });
    const session = new CameraSession(media);
    const start = session.start();
    await vi.waitFor(() => expect(media.getUserMedia).toHaveBeenCalled());
    session.stop();
    const lateStream = makeStream();
    resolveRequest(lateStream);
    await start;

    expect(lateStream.track.stopped).toBe(1);
    expect(session.getSnapshot().stream).toBeNull();
  });

  it("reports a disconnected camera and stops its track", async () => {
    const stream = makeStream();
    const session = new CameraSession(makeMediaDevices({ getUserMedia: async () => stream }));
    await session.start();

    stream.track.disconnect();

    expect(stream.track.stopped).toBe(1);
    expect(session.getSnapshot()).toMatchObject({ stream: null, status: "error" });
    expect(session.getSnapshot().error).toMatch(/disconnected/i);
  });

  it("uses the selected device constraint and exposes named devices after permission", async () => {
    const getUserMedia = vi.fn(async () => makeStream(new FakeTrack("camera-2")));
    const session = new CameraSession(makeMediaDevices({
      getUserMedia,
      devices: [makeDevice("camera-1", "Front camera"), makeDevice("camera-2", "USB camera")],
    }));

    await session.start("camera-2");

    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: expect.objectContaining({ deviceId: { exact: "camera-2" } }) }));
    expect(session.getSnapshot().devices.map((device) => device.label)).toEqual(["Front camera", "USB camera"]);
    expect(session.getSnapshot().activeDeviceId).toBe("camera-2");
  });

  it("turns an empty device list after devicechange into a disconnect state", async () => {
    const stream = makeStream();
    const media = makeMediaDevices({ getUserMedia: async () => stream });
    const session = new CameraSession(media);
    session.mount();
    await session.start();
    (media.enumerateDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    media.disconnectDevice();
    await vi.waitFor(() => expect(session.getSnapshot().status).toBe("error"));

    expect(session.getSnapshot().error).toMatch(/disconnected/i);
    expect(stream.track.stopped).toBe(1);
    session.dispose();
  });
});
