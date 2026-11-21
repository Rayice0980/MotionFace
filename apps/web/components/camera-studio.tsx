"use client";

import { useEffect, useRef, useState } from "react";
import { smoothTrackingFrame, type TrackingFrame } from "@motionface/motion-core";
import { createTracker, TrackingEngineError, type Tracker, type TrackingFailurePhase } from "@motionface/tracking-web";
import { AvatarPreview } from "@/components/avatar-preview";
import { useCamera } from "@/hooks/use-camera";
import { createVideoFrameScheduler, startInferenceLoop } from "@/lib/tracking-loop";

const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
] as const;

type SignalStatus = "loading" | "waiting" | "searching" | "detected" | "error" | "unavailable";
type SignalKind = "face" | "body" | "hands";

function drawTrackingOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement, frame: TrackingFrame | null) {
  const context = canvas.getContext("2d");
  if (!context) return;
  if (video.videoWidth && video.videoHeight && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame || !video.videoWidth || !video.videoHeight) return;

  context.strokeStyle = "rgba(90, 224, 255, .72)";
  context.fillStyle = "rgba(119, 239, 255, .9)";
  context.lineWidth = Math.max(2, canvas.width / 380);
  if (frame.pose) {
    for (const [start, end] of POSE_CONNECTIONS) {
      const a = frame.pose[start];
      const b = frame.pose[end];
      if (!a || !b || (a.visibility ?? 1) < 0.35 || (b.visibility ?? 1) < 0.35) continue;
      context.beginPath();
      context.moveTo(a.x * canvas.width, a.y * canvas.height);
      context.lineTo(b.x * canvas.width, b.y * canvas.height);
      context.stroke();
    }
    frame.pose.forEach((point) => {
      if ((point.visibility ?? 1) < 0.45) return;
      context.beginPath();
      context.arc(point.x * canvas.width, point.y * canvas.height, canvas.width / 180, 0, Math.PI * 2);
      context.fill();
    });
  }
  if (frame.face) {
    context.fillStyle = "rgba(103, 227, 255, .7)";
    frame.face.landmarks.forEach((point, index) => {
      if (index % 5 !== 0) return;
      context.beginPath();
      context.arc(point.x * canvas.width, point.y * canvas.height, canvas.width / 720, 0, Math.PI * 2);
      context.fill();
    });
  }
  frame.hands.forEach((hand) => {
    context.fillStyle = "#d4a6ff";
    hand.landmarks.forEach((point) => {
      context.beginPath();
      context.arc(point.x * canvas.width, point.y * canvas.height, canvas.width / 330, 0, Math.PI * 2);
      context.fill();
    });
  });
}

function getSignalStatus(
  kind: SignalKind,
  cameraLive: boolean,
  trackerStatus: "idle" | "loading" | "ready" | "error",
  failurePhase: TrackingFailurePhase | null,
  frame: TrackingFrame | null,
): SignalStatus {
  if (!cameraLive) return "waiting";
  if (trackerStatus === "loading") return "loading";
  if (trackerStatus === "error") {
    if (failurePhase === "runtime" || failurePhase === "inference" || failurePhase === kind) return "error";
    return "unavailable";
  }
  if (trackerStatus !== "ready" || !frame) return "waiting";
  const found = kind === "face" ? Boolean(frame.face) : kind === "body" ? Boolean(frame.pose) : frame.hands.length > 0;
  return found ? "detected" : "searching";
}

export function CameraStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<Tracker | null>(null);
  const smoothedFrameRef = useRef<TrackingFrame | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [trackerStatus, setTrackerStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [trackerError, setTrackerError] = useState("");
  const [failurePhase, setFailurePhase] = useState<TrackingFailurePhase | null>(null);
  const [frame, setFrame] = useState<TrackingFrame | null>(null);
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [inferenceFps, setInferenceFps] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState("");
  const camera = useCamera();
  const cameraStream = camera.stream;
  const stopCameraRequest = camera.stopCamera;

  useEffect(() => {
    const video = videoRef.current;
    let active = true;

    if (!video || !cameraStream) {
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      return () => { active = false; };
    }

    video.srcObject = cameraStream as MediaStream;
    void video.play()
      .then(() => {
        if (!active) return;
        setVideoReady(true);
        setPlaybackError("");
      })
      .catch(() => {
        if (!active) return;
        setPlaybackError("The camera preview could not start. Check browser playback settings and restart the camera.");
        stopCameraRequest();
      });

    return () => {
      active = false;
      video.pause();
      video.srcObject = null;
    };
  }, [cameraStream, stopCameraRequest]);

  useEffect(() => {
    if (!cameraStream) {
      trackerRef.current?.close();
      trackerRef.current = null;
      return;
    }

    let cancelled = false;
    let newTracker: Tracker | null = null;
    void createTracker()
      .then((tracker) => {
        if (cancelled) {
          tracker.close();
          return;
        }
        newTracker = tracker;
        trackerRef.current = tracker;
        setTrackerStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const engineError = error instanceof TrackingEngineError
          ? error
          : new TrackingEngineError("runtime", "The tracking models could not load. Check your connection and try again.", error);
        setTrackerError(engineError.message);
        setFailurePhase(engineError.phase);
        setTrackerStatus("error");
      });

    return () => {
      cancelled = true;
      newTracker?.close();
      if (trackerRef.current === newTracker) trackerRef.current = null;
    };
  }, [cameraStream]);

  useEffect(() => {
    const video = videoRef.current;
    const tracker = trackerRef.current;
    if (!cameraStream || !videoReady || trackerStatus !== "ready" || !video || !tracker) return;

    return startInferenceLoop({
      isReady: () => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
      frameKey: () => video.currentTime,
      detect: (timestamp) => {
        const activeTracker = trackerRef.current;
        if (!activeTracker) throw new Error("The tracking session has stopped.");
        return activeTracker.detect(video, timestamp);
      },
      onFrame: ({ frame: rawFrame, inferenceMs: measuredMs, inferenceFps: measuredFps }) => {
        const smoothed = smoothTrackingFrame(smoothedFrameRef.current, rawFrame, 0.48);
        smoothedFrameRef.current = smoothed;
        setFrame(smoothed);
        setInferenceMs(measuredMs);
        setInferenceFps(measuredFps);
      },
      onError: (error) => {
        trackerRef.current?.close();
        trackerRef.current = null;
        const engineError = error instanceof TrackingEngineError
          ? error
          : new TrackingEngineError("inference", "Tracking inference stopped unexpectedly. Stop the camera and try again.", error);
        setTrackerError(engineError.message);
        setFailurePhase(engineError.phase);
        setTrackerStatus("error");
        setFrame(null);
        setInferenceMs(null);
        setInferenceFps(null);
      },
      scheduler: createVideoFrameScheduler(video),
      minIntervalMs: 100,
    });
  }, [cameraStream, trackerStatus, videoReady]);

  useEffect(() => {
    if (overlayRef.current && videoRef.current) {
      drawTrackingOverlay(overlayRef.current, videoRef.current, frame);
    }
  }, [frame]);

  const cameraLive = camera.status === "live";
  const currentDevices = camera.devices;
  const visibleTrackerStatus = !cameraLive ? "idle" : trackerStatus === "idle" ? "loading" : trackerStatus;
  const visibleFrame = cameraLive ? frame : null;
  const signalStatus = (kind: SignalKind) => getSignalStatus(kind, cameraLive, visibleTrackerStatus, failurePhase, visibleFrame);

  function resetTrackingUi() {
    smoothedFrameRef.current = null;
    setVideoReady(false);
    setTrackerStatus("idle");
    setTrackerError("");
    setFailurePhase(null);
    setFrame(null);
    setInferenceMs(null);
    setInferenceFps(null);
    setPlaybackError("");
  }

  function requestCamera(deviceId?: string) {
    resetTrackingUi();
    camera.startCamera(deviceId);
  }

  function stopCamera() {
    camera.stopCamera();
    resetTrackingUi();
  }

  return (
    <section className="studio-area" id="studio" aria-label="Animation studio">
      <div className="preview-toolbar">
        <div className="preview-title">
          <span className="live-spark" aria-hidden="true">✦</span>
          <div>
            <h2>Animation studio</h2>
            <p>Track movement and preview your avatar</p>
          </div>
        </div>
        <div className="preview-state" aria-live="polite">
          <span className={cameraLive && visibleTrackerStatus === "ready" ? "status-dot active" : "status-dot"} />
          {camera.status === "requesting" ? "CONNECTING CAMERA" : cameraLive ? (visibleTrackerStatus === "ready" ? "TRACKING LIVE" : visibleTrackerStatus === "error" ? "TRACKING ERROR" : "LOADING MODELS") : camera.status === "error" ? "CAMERA ERROR" : "STUDIO READY"}
        </div>
      </div>

      <div className="stage-grid">
        <div className="avatar-stage">
          <div className="stage-orbit orbit-one" />
          <div className="stage-orbit orbit-two" />
          <AvatarPreview frame={visibleFrame} />
          <div className="avatar-stage-copy">
            <span className="avatar-stage-kicker">LIVE OUTPUT</span>
            <strong>{visibleFrame?.face || visibleFrame?.pose || visibleFrame?.hands.length ? "Movement is being tracked" : "Your preview is ready"}</strong>
            <span>Generic avatar rig · local camera processing</span>
          </div>
          <div className="camera-inset">
            <div className="camera-inset-head">
              <span><span className={cameraLive ? "status-dot active" : "status-dot"} /> CAMERA INPUT</span>
              {cameraLive && visibleTrackerStatus === "ready" ? <span>{inferenceFps === null ? "—" : inferenceFps.toFixed(0)} INF. FPS</span> : null}
            </div>
            <div className="camera-feed">
              <video ref={videoRef} autoPlay muted playsInline aria-label="Mirrored webcam preview" />
              <canvas ref={overlayRef} aria-hidden="true" />
              {!cameraLive ? (
                <div className="camera-placeholder">
                  <span className="camera-placeholder-icon">◎</span>
                  <span>{camera.status === "error" ? "Camera unavailable" : "Camera preview"}</span>
                  <small>{camera.permission === "denied" ? "Allow access in browser site settings" : "Start camera to see your preview"}</small>
                </div>
              ) : null}
              {camera.status === "requesting" ? <div className="camera-overlay-message">Waiting for camera permission…</div> : null}
              {cameraLive && visibleTrackerStatus === "loading" ? <div className="camera-overlay-message">Loading face, body & hand models…</div> : null}
            </div>
          </div>
        </div>

        <aside className="tracking-panel">
          <div className="panel-heading tracking-heading">
            <div><p className="eyebrow">TRACKING ENGINE</p><h2>Live signals</h2></div>
            <span className="engine-indicator"><span className={visibleTrackerStatus === "ready" ? "status-dot active" : "status-dot"} /></span>
          </div>
          <div className="signal-list">
            <SignalRow label="Face" detail="Expression · head pose" status={signalStatus("face")} icon="◉" />
            <SignalRow label="Body" detail="Pose · shoulders · limbs" status={signalStatus("body")} icon="⌁" />
            <SignalRow label="Hands" detail={visibleFrame ? `${visibleFrame.hands.length} detected` : "Hand landmarks"} status={signalStatus("hands")} icon="✳" />
          </div>

          <div className="panel-divider" />
          <label className="field-label" htmlFor="camera-device">CAMERA DEVICE</label>
          <select
            id="camera-device"
            className="device-select"
            value={camera.activeDeviceId}
            disabled={!cameraLive || currentDevices.length < 2}
            onChange={(event) => requestCamera(event.target.value)}
            aria-label="Select camera device"
          >
            {cameraLive && !currentDevices.length ? <option value={camera.activeDeviceId}>Current camera</option> : null}
            {currentDevices.map((device) => <option value={device.deviceId} key={device.deviceId}>{device.label}</option>)}
          </select>

          <div className="engine-metrics">
            <div><span>Inference time</span><strong>{!cameraLive || inferenceMs === null ? "—" : `${inferenceMs.toFixed(1)} ms`}</strong></div>
            <div><span>Inference FPS</span><strong>{!cameraLive ? "—" : inferenceFps === null ? "Measuring" : inferenceFps.toFixed(1)}</strong></div>
            <div><span>Processing</span><strong>On-device · CPU</strong></div>
          </div>

          {!cameraLive ? (
            <button className="primary-button start-camera" type="button" onClick={() => requestCamera()} disabled={camera.status === "requesting"}>
              <span aria-hidden="true">◉</span>{camera.status === "requesting" ? "Connecting camera…" : camera.status === "error" ? "Try camera again" : "Start camera & tracking"}
            </button>
          ) : (
            <button className="secondary-button stop-camera" type="button" onClick={stopCamera}>
              <span className="stop-square" aria-hidden="true" /> Stop camera
            </button>
          )}
          <p className="camera-note">Camera frames are processed in this browser. First start downloads the on-device tracking models.</p>
          {camera.error || trackerError || playbackError ? <p className="inline-error" role="alert">{camera.error || trackerError || playbackError}</p> : null}
          {camera.permission === "denied" && !cameraLive ? (
            <p className="permission-help">To enable access, open this site’s browser permissions, set Camera to Allow, then retry. Camera access requires HTTPS or localhost.</p>
          ) : null}
        </aside>
      </div>

      <div className="bottom-status">
        <span className="status-group"><span className={cameraLive ? "status-dot active" : "status-dot"} /> Camera <strong>{cameraLive ? "On" : camera.status === "error" ? "Unavailable" : "Off"}</strong></span>
        <span className="status-separator" />
        <span className="status-group"><span className={visibleTrackerStatus === "ready" ? "status-dot active" : "status-dot"} /> Tracking <strong>{visibleTrackerStatus === "ready" ? "Ready" : visibleTrackerStatus === "loading" ? "Loading models" : visibleTrackerStatus === "error" ? "Error" : "Standby"}</strong></span>
        <span className="status-separator" />
        <span className="status-group"><span className="status-dot muted" /> Virtual camera <strong>Not connected</strong></span>
        <span className="status-spacer" />
        <span className="output-note">Browser preview only · No system virtual camera</span>
      </div>
    </section>
  );
}

function SignalRow({ label, detail, status, icon }: { label: string; detail: string; status: SignalStatus; icon: string }) {
  const stateLabel = {
    detected: "DETECTED",
    loading: "LOADING",
    waiting: "WAITING",
    searching: "SEARCHING",
    error: "ERROR",
    unavailable: "OFFLINE",
  }[status];

  return (
    <div className={`signal-row signal-${status}`}>
      <span className={`signal-icon ${status === "detected" ? "signal-active" : ""}`} aria-hidden="true">{icon}</span>
      <span className="signal-copy"><strong>{label}</strong><small>{detail}</small></span>
      <span className={`signal-state state-${status}`}>{stateLabel}</span>
    </div>
  );
}
