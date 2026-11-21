"use client";

import { useEffect, useRef, useState } from "react";
import type { TrackingFrame } from "@motionface/motion-core";
import { createTracker, type Tracker } from "@motionface/tracking-web";
import { AvatarPreview } from "@/components/avatar-preview";
import { useCamera } from "@/hooks/use-camera";

const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
] as const;

function drawTrackingOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement, frame: TrackingFrame | null) {
  if (!video.videoWidth || !video.videoHeight) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame) return;

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

export function CameraStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<Tracker | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [trackerStatus, setTrackerStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [trackerError, setTrackerError] = useState("");
  const [frame, setFrame] = useState<TrackingFrame | null>(null);
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [inferenceFps, setInferenceFps] = useState(0);
  const [playbackError, setPlaybackError] = useState("");
  const camera = useCamera();

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !camera.stream) {
      if (video) video.srcObject = null;
      return;
    }

    video.srcObject = camera.stream;
    void video.play()
      .then(() => {
        setVideoReady(true);
        setPlaybackError("");
      })
      .catch(() => setPlaybackError("Camera preview could not play. Try stopping and starting the camera."));

    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [camera.stream]);

  useEffect(() => {
    if (!camera.stream) {
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
        setTrackerError(error instanceof Error ? error.message : "The tracking models could not load.");
        setTrackerStatus("error");
      });

    return () => {
      cancelled = true;
      newTracker?.close();
      if (trackerRef.current === newTracker) trackerRef.current = null;
    };
  }, [camera.stream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!videoReady || trackerStatus !== "ready" || !video) return;

    let animationId = 0;
    let lastVideoTime = -1;
    let lastInferenceAt = 0;
    let sampleStartedAt = performance.now();
    let sampleCount = 0;

    const tick = (now: number) => {
      const tracker = trackerRef.current;
      if (tracker && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (video.currentTime !== lastVideoTime && now - lastInferenceAt >= 100) {
          lastVideoTime = video.currentTime;
          lastInferenceAt = now;
          const startedAt = performance.now();
          try {
            setFrame(tracker.detect(video, startedAt));
            setInferenceMs(performance.now() - startedAt);
            sampleCount += 1;
            if (now - sampleStartedAt >= 1000) {
              setInferenceFps(sampleCount / ((now - sampleStartedAt) / 1000));
              sampleCount = 0;
              sampleStartedAt = now;
            }
          } catch (error) {
            setTrackerError(error instanceof Error ? error.message : "Tracking stopped unexpectedly.");
            setTrackerStatus("error");
            setFrame(null);
            return;
          }
        }
      }
      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [trackerStatus, videoReady]);

  useEffect(() => {
    if (overlayRef.current && videoRef.current) {
      drawTrackingOverlay(overlayRef.current, videoRef.current, frame);
    }
  }, [frame]);

  const cameraLive = camera.status === "live";
  const currentDevices = camera.devices;

  function requestCamera(deviceId?: string) {
    setVideoReady(false);
    setTrackerStatus("idle");
    setTrackerError("");
    setFrame(null);
    setInferenceMs(null);
    setInferenceFps(0);
    setPlaybackError("");
    void camera.startCamera(deviceId);
  }

  function stopCamera() {
    camera.stopCamera();
    setVideoReady(false);
    setTrackerStatus("idle");
    setFrame(null);
    setInferenceMs(null);
    setInferenceFps(0);
    setTrackerError("");
    setPlaybackError("");
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
        <div className="preview-state">
          <span className={cameraLive && trackerStatus === "ready" ? "status-dot active" : "status-dot"} />
          {cameraLive ? (trackerStatus === "ready" ? "TRACKING LIVE" : trackerStatus === "error" ? "TRACKING ERROR" : "LOADING MODELS") : "STUDIO READY"}
        </div>
      </div>

      <div className="stage-grid">
        <div className="avatar-stage">
          <div className="stage-orbit orbit-one" />
          <div className="stage-orbit orbit-two" />
          <AvatarPreview frame={frame} />
          <div className="avatar-stage-copy">
            <span className="avatar-stage-kicker">LIVE OUTPUT</span>
            <strong>{frame?.face || frame?.pose ? "Movement is being tracked" : "Your preview is ready"}</strong>
            <span>Generic avatar rig · local camera processing</span>
          </div>
          <div className="camera-inset">
            <div className="camera-inset-head">
              <span><span className={cameraLive ? "status-dot active" : "status-dot"} /> CAMERA INPUT</span>
              {frame ? <span>{inferenceFps.toFixed(0)} FPS</span> : null}
            </div>
            <div className="camera-feed">
              <video ref={videoRef} autoPlay muted playsInline aria-label="Mirrored webcam preview" />
              <canvas ref={overlayRef} aria-hidden="true" />
              {!cameraLive ? <div className="camera-placeholder"><span className="camera-placeholder-icon">◎</span><span>Camera preview</span><small>Waiting for permission</small></div> : null}
              {camera.status === "requesting" ? <div className="camera-overlay-message">Waiting for camera permission…</div> : null}
            </div>
          </div>
        </div>

        <aside className="tracking-panel">
          <div className="panel-heading tracking-heading">
            <div><p className="eyebrow">TRACKING ENGINE</p><h2>Live signals</h2></div>
            <span className="engine-indicator"><span className={trackerStatus === "ready" ? "status-dot active" : "status-dot"} /></span>
          </div>
          <div className="signal-list">
            <SignalRow label="Face" detail="Expression · head pose" active={Boolean(frame?.face)} icon="◉" />
            <SignalRow label="Body" detail="Pose · shoulders · limbs" active={Boolean(frame?.pose)} icon="⌁" />
            <SignalRow label="Hands" detail={`${frame?.hands.length ?? 0} detected`} active={Boolean(frame?.hands.length)} icon="✳" />
          </div>

          <div className="panel-divider" />
          <label className="field-label" htmlFor="camera-device">CAMERA DEVICE</label>
          <select
            id="camera-device"
            className="device-select"
            value={camera.activeDeviceId}
            disabled={!cameraLive || currentDevices.length < 2}
            onChange={(event) => requestCamera(event.target.value)}
          >
            {cameraLive && !currentDevices.length ? <option value={camera.activeDeviceId}>Current camera</option> : null}
            {currentDevices.map((device) => <option value={device.deviceId} key={device.deviceId}>{device.label}</option>)}
          </select>

          <div className="engine-metrics">
            <div><span>Inference</span><strong>{inferenceMs === null ? "—" : `${inferenceMs.toFixed(0)} ms`}</strong></div>
            <div><span>Mode</span><strong>On-device · CPU</strong></div>
          </div>

          {!cameraLive ? (
            <button className="primary-button start-camera" type="button" onClick={() => requestCamera()} disabled={camera.status === "requesting"}>
              <span aria-hidden="true">◉</span>{camera.status === "requesting" ? "Connecting camera…" : "Start camera & tracking"}
            </button>
          ) : (
            <button className="secondary-button stop-camera" type="button" onClick={stopCamera}>
              <span className="stop-square" aria-hidden="true" /> Stop camera
            </button>
          )}
          <p className="camera-note">The first start downloads public tracking models. Your camera frames and photo remain in this browser.</p>
          {camera.error || trackerError || playbackError ? <p className="inline-error" role="alert">{camera.error || trackerError || playbackError}</p> : null}
        </aside>
      </div>

      <div className="bottom-status">
        <span className="status-group"><span className={cameraLive ? "status-dot active" : "status-dot"} /> Camera <strong>{cameraLive ? "On" : "Off"}</strong></span>
        <span className="status-separator" />
        <span className="status-group"><span className={trackerStatus === "ready" ? "status-dot active" : "status-dot"} /> Tracking <strong>{trackerStatus === "ready" ? "Ready" : trackerStatus === "loading" ? "Loading" : "Standby"}</strong></span>
        <span className="status-separator" />
        <span className="status-group"><span className="status-dot muted" /> Virtual camera <strong>Not connected</strong></span>
        <span className="status-spacer" />
        <span className="output-note">Browser preview only · No system virtual camera</span>
      </div>
    </section>
  );
}

function SignalRow({ label, detail, active, icon }: { label: string; detail: string; active: boolean; icon: string }) {
  return (
    <div className="signal-row">
      <span className={`signal-icon ${active ? "signal-active" : ""}`} aria-hidden="true">{icon}</span>
      <span className="signal-copy"><strong>{label}</strong><small>{detail}</small></span>
      <span className={active ? "signal-state detected" : "signal-state"}>{active ? "DETECTED" : "WAITING"}</span>
    </div>
  );
}
