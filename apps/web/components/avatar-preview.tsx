"use client";

import { useEffect, useRef, useState } from "react";
import type { TrackingFrame } from "@motionface/motion-core";

export function AvatarPreview({ frame }: { frame: TrackingFrame | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(frame);
  const sceneRef = useRef<{ apply: (frame: TrackingFrame | null) => void; dispose: () => void } | null>(null);
  const [status, setStatus] = useState("Preparing 3D preview");

  useEffect(() => {
    frameRef.current = frame;
    sceneRef.current?.apply(frame);
  }, [frame]);

  useEffect(() => {
    let cancelled = false;
    let scene: { apply: (frame: TrackingFrame | null) => void; dispose: () => void } | undefined;

    void import("@motionface/avatar-three")
      .then(({ AvatarScene }) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        scene = new AvatarScene(canvas);
        sceneRef.current = scene;
        scene.apply(frameRef.current);
        setStatus("3D preview ready");
      })
      .catch(() => setStatus("3D preview could not start in this browser"));

    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  return (
    <div className="avatar-preview">
      <canvas ref={canvasRef} aria-label="Generic 3D avatar preview controlled by camera tracking" />
      <span className="avatar-caption">GENERIC 3D RIG <span>·</span> NOT A PHOTO RECONSTRUCTION</span>
      <span className="visually-hidden" aria-live="polite">{status}</span>
      {!frame ? <span className="avatar-idle-hint">Start your camera to see live movement</span> : null}
    </div>
  );
}
