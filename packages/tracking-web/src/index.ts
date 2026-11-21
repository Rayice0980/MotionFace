import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import type { HandTracking, Landmark, TrackingFrame } from "@motionface/motion-core";

const TASKS_VERSION = "1.2.3";
const WASM_PATH = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export interface Tracker {
  detect(video: HTMLVideoElement, timestamp: number): TrackingFrame;
  close(): void;
}

function copyLandmarks(points: Array<{ x: number; y: number; z: number; visibility?: number }> = []): Landmark[] {
  return points.map(({ x, y, z, visibility }) => ({ x, y, z, visibility }));
}

export async function createTracker(): Promise<Tracker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  let face: FaceLandmarker | undefined;
  let pose: PoseLandmarker | undefined;
  let hands: HandLandmarker | undefined;

  try {
    face = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: "CPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.45,
      minFacePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
    pose = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate: "CPU" },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.45,
      minPosePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
    hands = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate: "CPU" },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
  } catch (error) {
    face?.close();
    pose?.close();
    hands?.close();
    throw error;
  }

  let previousTimestamp = -1;
  let closed = false;

  return {
    detect(video, timestamp) {
      if (closed) throw new Error("The tracker has been closed.");
      const monotonicTimestamp = Math.max(timestamp, previousTimestamp + 1);
      previousTimestamp = monotonicTimestamp;

      const faceResult = face!.detectForVideo(video, monotonicTimestamp);
      const poseResult = pose!.detectForVideo(video, monotonicTimestamp);
      const handResult = hands!.detectForVideo(video, monotonicTimestamp);

      const categories = faceResult.faceBlendshapes[0]?.categories ?? [];
      const blendshapes = Object.fromEntries(
        categories.map((category) => [category.categoryName, category.score]),
      );
      const handTracking: HandTracking[] = handResult.landmarks.map((landmarks, index) => {
        const categoryName = handResult.handedness[index]?.[0]?.categoryName;
        const handedness = categoryName === "Left" || categoryName === "Right" ? categoryName : "Unknown";
        return { handedness, landmarks: copyLandmarks(landmarks) };
      });

      return {
        timestamp: monotonicTimestamp,
        face: faceResult.faceLandmarks[0]
          ? {
              landmarks: copyLandmarks(faceResult.faceLandmarks[0]),
              blendshapes,
            }
          : null,
        pose: poseResult.landmarks[0] ? copyLandmarks(poseResult.landmarks[0]) : null,
        hands: handTracking,
      };
    },
    close() {
      if (closed) return;
      closed = true;
      face!.close();
      pose!.close();
      hands!.close();
    },
  };
}
