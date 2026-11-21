"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraSession, type CameraPermission, type CameraSessionSnapshot } from "@/lib/camera-session";

const INITIAL_STATE: CameraSessionSnapshot = {
  stream: null,
  devices: [],
  activeDeviceId: "",
  status: "idle",
  permission: "unknown",
  error: "",
};

export function useCamera() {
  const [snapshot, setSnapshot] = useState(INITIAL_STATE);
  const sessionRef = useRef<CameraSession | null>(null);

  useEffect(() => {
    const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    const readPermission = async (): Promise<CameraPermission> => {
      if (!navigator.permissions?.query) return "unknown";
      const permission = await navigator.permissions.query({ name: "camera" as PermissionName });
      return permission.state;
    };
    const session = new CameraSession(mediaDevices, readPermission);
    sessionRef.current = session;
    const unsubscribe = session.subscribe(setSnapshot);
    session.mount();

    const stopOnPageHide = () => session.stop();
    window.addEventListener("pagehide", stopOnPageHide);

    return () => {
      window.removeEventListener("pagehide", stopOnPageHide);
      unsubscribe();
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, []);

  const startCamera = useCallback((deviceId?: string) => {
    void sessionRef.current?.start(deviceId);
  }, []);

  const stopCamera = useCallback(() => {
    sessionRef.current?.stop();
  }, []);

  return { ...snapshot, startCamera, stopCamera };
}
