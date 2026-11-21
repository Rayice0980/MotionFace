export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface FaceTracking {
  landmarks: Landmark[];
  blendshapes: Record<string, number>;
}

export interface HandTracking {
  handedness: "Left" | "Right" | "Unknown";
  landmarks: Landmark[];
}

export interface TrackingFrame {
  timestamp: number;
  face: FaceTracking | null;
  pose: Landmark[] | null;
  hands: HandTracking[];
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface RigPose {
  face: {
    position: Vector3;
    rotation: Vector3;
    expression: {
      jawOpen: number;
      smile: number;
      blinkLeft: number;
      blinkRight: number;
    };
  } | null;
  pose: Vector3[] | null;
  hands: Array<{ handedness: HandTracking["handedness"]; joints: Vector3[] }>;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

function toAvatarSpace(point: Landmark): Vector3 {
  return {
    x: clamp((point.x - 0.5) * 2.4, -1.2, 1.2),
    y: clamp((0.5 - point.y) * 2.4, -1.2, 1.2),
    z: clamp(point.z * 2.4, -1.2, 1.2),
  };
}

function blendshape(face: FaceTracking, name: string): number {
  return clamp(face.blendshapes[name] ?? 0, 0, 1);
}

function mapFace(face: FaceTracking): RigPose["face"] {
  const leftEye = face.landmarks[33];
  const rightEye = face.landmarks[263];
  const nose = face.landmarks[1];

  if (!leftEye || !rightEye || !nose) return null;

  const centerX = (leftEye.x + rightEye.x) / 2;
  const centerY = (leftEye.y + rightEye.y) / 2;
  const eyeDistance = Math.max(0.001, Math.abs(rightEye.x - leftEye.x));
  const jawOpen = blendshape(face, "jawOpen");
  const smile = (blendshape(face, "mouthSmileLeft") + blendshape(face, "mouthSmileRight")) / 2;

  return {
    position: toAvatarSpace(nose),
    rotation: {
      x: clamp(((nose.y - centerY) / eyeDistance - 0.55) * 0.8, -0.55, 0.55),
      y: clamp(((nose.x - centerX) / eyeDistance) * 1.4, -0.85, 0.85),
      z: clamp(Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x), -0.7, 0.7),
    },
    expression: {
      jawOpen,
      smile,
      blinkLeft: blendshape(face, "eyeBlinkLeft"),
      blinkRight: blendshape(face, "eyeBlinkRight"),
    },
  };
}

export function mapTrackingToRig(frame: TrackingFrame): RigPose {
  return {
    face: frame.face ? mapFace(frame.face) : null,
    pose: frame.pose ? frame.pose.map(toAvatarSpace) : null,
    hands: frame.hands.map((hand) => ({
      handedness: hand.handedness,
      joints: hand.landmarks.map(toAvatarSpace),
    })),
  };
}

export function smoothValue(previous: number | null, current: number, alpha: number): number {
  if (previous === null || !Number.isFinite(previous)) return current;
  const amount = clamp(alpha, 0, 1);
  return previous + (current - previous) * amount;
}
