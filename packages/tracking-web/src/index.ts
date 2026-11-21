import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import type { HandTracking, Landmark, TrackingFrame } from "@motionface/motion-core";
import { withMediaPipeInfoFiltered } from "./console-log-filter";

const TASKS_VERSION = "1.2.3";
const WASM_PATH = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
type FaceDetector = Awaited<ReturnType<typeof FaceLandmarker.createFromOptions>>;
type PoseDetector = Awaited<ReturnType<typeof PoseLandmarker.createFromOptions>>;
type HandDetector = Awaited<ReturnType<typeof HandLandmarker.createFromOptions>>;

export interface Tracker {
  detect(video: HTMLVideoElement, timestamp: number): TrackingFrame;
  close(): void;
}

export type TrackingFailurePhase = "runtime" | "face" | "pose" | "hands" | "inference";

export class TrackingEngineError extends Error {
  constructor(
    readonly phase: TrackingFailurePhase,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "TrackingEngineError";
    this.cause = cause;
  }

  declare cause: unknown;
}

export interface TrackerFactories {
  loadFileset: () => Promise<VisionFileset>;
  createFace: (fileset: VisionFileset) => Promise<FaceDetector>;
  createPose: (fileset: VisionFileset) => Promise<PoseDetector>;
  createHands: (fileset: VisionFileset) => Promise<HandDetector>;
}

const defaultFactories: TrackerFactories = {
  loadFileset: () => FilesetResolver.forVisionTasks(WASM_PATH),
  createFace: (fileset) => FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate: "CPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.45,
    minFacePresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
  }),
  createPose: (fileset) => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: "CPU" },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.45,
    minPosePresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
  }),
  createHands: (fileset) => HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAND_MODEL, delegate: "CPU" },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.4,
    minTrackingConfidence: 0.45,
  }),
};

function copyLandmarks(points: Array<{ x: number; y: number; z: number; visibility?: number }> = []): Landmark[] {
  return points.map(({ x, y, z, visibility }) => ({ x, y, z, visibility }));
}

function closeDetectors(detectors: Array<{ close(): void } | undefined>): void {
  for (const detector of detectors) {
    try {
      detector?.close();
    } catch {
      // Continue closing the other tasks even if one native/WASM handle has already failed.
    }
  }
}

function modelLoadMessage(phase: Exclude<TrackingFailurePhase, "inference">): string {
  if (phase === "runtime") return "The tracking runtime could not load. Check your connection and reload the page.";
  const modelName = phase === "pose" ? "body" : phase === "hands" ? "hand" : "face";
  return `The ${modelName} tracking model could not load. Check your connection and try again.`;
}

export async function createTracker(factories: TrackerFactories = defaultFactories): Promise<Tracker> {
  let face: FaceDetector | undefined;
  let pose: PoseDetector | undefined;
  let hands: HandDetector | undefined;
  let phase: Exclude<TrackingFailurePhase, "inference"> = "runtime";

  try {
    await withMediaPipeInfoFiltered(async () => {
      const fileset = await factories.loadFileset();
      phase = "face";
      face = await factories.createFace(fileset);
      phase = "pose";
      pose = await factories.createPose(fileset);
      phase = "hands";
      hands = await factories.createHands(fileset);
    });
  } catch (error) {
    closeDetectors([face, pose, hands]);
    throw new TrackingEngineError(phase, modelLoadMessage(phase), error);
  }

  let previousTimestamp = -1;
  let closed = false;

  return {
    detect(video, timestamp) {
      if (closed) throw new Error("The tracker has been closed.");
      const monotonicTimestamp = Math.max(timestamp, previousTimestamp + 1);
      previousTimestamp = monotonicTimestamp;

      try {
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
      } catch (error) {
        throw new TrackingEngineError("inference", "Tracking inference failed on a camera frame. Restart tracking and try again.", error);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      closeDetectors([face, pose, hands]);
    },
  };
}
