"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCameraErrorMessage } from "@/lib/camera-errors";

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState("");
  const [status, setStatus] = useState<"idle" | "requesting" | "live" | "error">("idle");
  const [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const requestIdRef = useRef(0);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const available = await navigator.mediaDevices.enumerateDevices();
      setDevices(
        available
          .filter((device) => device.kind === "videoinput")
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `Camera ${index + 1}`,
          })),
      );
    } catch {
      setDevices([]);
    }
  }, []);

  const stopCamera = useCallback(() => {
    requestIdRef.current += 1;
    releaseStream();
    setStream(null);
    setActiveDeviceId("");
    setError("");
    setStatus("idle");
  }, [releaseStream]);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      const requestId = ++requestIdRef.current;
      releaseStream();
      setStream(null);
      setError("");
      setStatus("requesting");

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser does not support camera access.");
        }
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 30 },
          },
        });

        if (requestId !== requestIdRef.current) {
          cameraStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = cameraStream;
        const selectedDeviceId = cameraStream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId ?? "";
        setActiveDeviceId(selectedDeviceId);
        setStream(cameraStream);
        setStatus("live");
        await refreshDevices();
      } catch (cameraError) {
        if (requestId !== requestIdRef.current) return;
        setError(getCameraErrorMessage(cameraError));
        setStatus("error");
      }
    },
    [refreshDevices, releaseStream],
  );

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    const onDeviceChange = () => void refreshDevices();
    mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () => {
      requestIdRef.current += 1;
      releaseStream();
      mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
    };
  }, [refreshDevices, releaseStream]);

  return { stream, devices, activeDeviceId, status, error, startCamera, stopCamera };
}
