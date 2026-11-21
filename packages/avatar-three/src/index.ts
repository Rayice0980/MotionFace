import * as THREE from "three";
import { mapTrackingToRig } from "@motionface/motion-core";
import type { Landmark, TrackingFrame, Vector3 } from "@motionface/motion-core";

const BODY_LANDMARKS = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

const HAND_SEGMENTS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
] as const;

function vector(point: Vector3): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}

function makeBone(color: number, radius: number): THREE.Mesh {
  const bone = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.82, radius, 1, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.04 }),
  );
  bone.castShadow = true;
  return bone;
}

function placeBone(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.scale.set(1, Math.max(length, 0.001), 1);
  mesh.visible = length > 0.015;
}

function pointAt(points: Landmark[] | null, index: number): THREE.Vector3 | null {
  const point = points?.[index];
  if (!point || (point.visibility !== undefined && point.visibility < 0.35)) return null;
  return vector({
    x: (point.x - 0.5) * 3.2,
    y: (0.5 - point.y) * 3.2,
    z: -point.z * 1.6,
  });
}

export class AvatarScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  private readonly avatar = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly headShell: THREE.Mesh;
  private readonly leftEye: THREE.Mesh;
  private readonly rightEye: THREE.Mesh;
  private readonly jaw: THREE.Mesh;
  private readonly torso: THREE.Mesh;
  private readonly bodyBones: THREE.Mesh[];
  private readonly handBones: THREE.Mesh[][] = [];
  private readonly resizeObserver: ResizeObserver;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.scene.background = null;
    this.camera.position.set(0, 0, 7.2);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0xc5e2ff, 0x18213a, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
    keyLight.position.set(-3, 5, 5);
    keyLight.castShadow = true;
    this.scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x5f91ff, 16, 14);
    rimLight.position.set(3, 1, -2);
    this.scene.add(rimLight);

    this.scene.add(this.avatar);
    const skin = new THREE.MeshStandardMaterial({ color: 0xc68b72, roughness: 0.58 });
    const navy = new THREE.MeshStandardMaterial({ color: 0x415a94, roughness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x182442, roughness: 0.68 });

    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.72, 5, 16), navy);
    this.torso.position.set(0, -0.05, 0);
    this.torso.castShadow = true;
    this.avatar.add(this.torso);
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), dark);
    pelvis.scale.set(1.1, 0.66, 0.75);
    pelvis.position.y = -0.62;
    this.avatar.add(pelvis);

    this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 24), skin));
    this.headShell = new THREE.Mesh(
      new THREE.SphereGeometry(0.43, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.48),
      new THREE.MeshStandardMaterial({ color: 0x172039, roughness: 0.62 }),
    );
    this.headShell.position.y = 0.03;
    this.head.add(this.headShell);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35 });
    this.leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), eyeMaterial);
    this.rightEye = this.leftEye.clone();
    this.leftEye.position.set(-0.15, -0.055, 0.37);
    this.rightEye.position.set(0.15, -0.055, 0.37);
    this.head.add(this.leftEye, this.rightEye);
    this.jaw = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x452b35, roughness: 0.65 }),
    );
    this.jaw.scale.set(0.82, 0.08, 0.22);
    this.jaw.position.set(0, -0.2, 0.34);
    this.head.add(this.jaw);
    this.head.position.set(0, 0.76, 0);
    this.avatar.add(this.head);

    this.bodyBones = Array.from({ length: 10 }, (_, index) => {
      const bone = makeBone(index < 4 ? 0xc68b72 : 0x25365b, index < 4 ? 0.075 : 0.09);
      this.avatar.add(bone);
      return bone;
    });
    for (let hand = 0; hand < 2; hand += 1) {
      const segments = HAND_SEGMENTS.map(() => {
        const bone = makeBone(0xc68b72, 0.027);
        this.avatar.add(bone);
        return bone;
      });
      this.handBones.push(segments);
    }

    this.resizeObserver = new ResizeObserver(() => this.resize(canvas.clientWidth, canvas.clientHeight));
    this.resizeObserver.observe(canvas);
    this.resize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setAnimationLoop(() => {
      if (!this.disposed) this.renderer.render(this.scene, this.camera);
    });
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  apply(frame: TrackingFrame | null): void {
    if (!frame) {
      this.resetPose();
      return;
    }
    const rig = mapTrackingToRig(frame);
    if (rig.face) {
      this.head.position.copy(vector(rig.face.position));
      this.head.position.y += 0.23;
      this.head.rotation.set(rig.face.rotation.x, rig.face.rotation.y, rig.face.rotation.z);
      this.jaw.scale.y = 0.08 + rig.face.expression.jawOpen * 0.7;
      this.leftEye.scale.y = Math.max(0.08, 1 - rig.face.expression.blinkLeft * 0.9);
      this.rightEye.scale.y = Math.max(0.08, 1 - rig.face.expression.blinkRight * 0.9);
      this.headShell.visible = true;
    } else {
      const nose = pointAt(frame.pose, BODY_LANDMARKS.nose);
      if (nose) {
        this.head.position.copy(nose);
        this.head.position.y += 0.23;
      } else {
        this.head.position.set(0, 0.76, 0);
      }
      this.head.rotation.set(0, 0, 0);
      this.jaw.scale.y = 0.08;
      this.leftEye.scale.y = 1;
      this.rightEye.scale.y = 1;
    }

    if (rig.pose) {
      const point = (index: number) => pointAt(frame.pose, index);
      const pairs = [
        [BODY_LANDMARKS.leftShoulder, BODY_LANDMARKS.leftElbow],
        [BODY_LANDMARKS.leftElbow, BODY_LANDMARKS.leftWrist],
        [BODY_LANDMARKS.rightShoulder, BODY_LANDMARKS.rightElbow],
        [BODY_LANDMARKS.rightElbow, BODY_LANDMARKS.rightWrist],
        [BODY_LANDMARKS.leftHip, BODY_LANDMARKS.leftKnee],
        [BODY_LANDMARKS.leftKnee, BODY_LANDMARKS.leftAnkle],
        [BODY_LANDMARKS.rightHip, BODY_LANDMARKS.rightKnee],
        [BODY_LANDMARKS.rightKnee, BODY_LANDMARKS.rightAnkle],
        [BODY_LANDMARKS.leftShoulder, BODY_LANDMARKS.rightShoulder],
        [BODY_LANDMARKS.leftHip, BODY_LANDMARKS.rightHip],
      ] as const;
      pairs.forEach(([fromIndex, toIndex], index) => {
        const from = point(fromIndex);
        const to = point(toIndex);
        const bone = this.bodyBones[index];
        if (from && to) placeBone(bone, from, to);
        else bone.visible = false;
      });
      const shoulderMid = point(BODY_LANDMARKS.leftShoulder)?.add(point(BODY_LANDMARKS.rightShoulder) ?? new THREE.Vector3());
      const hipMid = point(BODY_LANDMARKS.leftHip)?.add(point(BODY_LANDMARKS.rightHip) ?? new THREE.Vector3());
      if (shoulderMid && hipMid) {
        shoulderMid.multiplyScalar(0.5);
        hipMid.multiplyScalar(0.5);
        this.torso.position.copy(shoulderMid).add(hipMid).multiplyScalar(0.5);
        const torsoAxis = new THREE.Vector3().subVectors(shoulderMid, hipMid);
        const torsoLength = torsoAxis.length();
        this.torso.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), torsoAxis.normalize());
        this.torso.scale.y = Math.max(0.55, torsoLength * 0.72);
      }
    } else {
      this.bodyBones.forEach((bone) => (bone.visible = false));
      this.torso.position.set(0, -0.05, 0);
      this.torso.quaternion.identity();
      this.torso.scale.set(1, 1, 1);
    }

    rig.hands.forEach((hand, index) => {
      const bones = this.handBones[index];
      if (!bones) return;
      HAND_SEGMENTS.forEach(([fromIndex, toIndex], segmentIndex) => {
        const from = hand.joints[fromIndex];
        const to = hand.joints[toIndex];
        if (from && to) placeBone(bones[segmentIndex], vector(from), vector(to));
        else bones[segmentIndex].visible = false;
      });
    });
    for (let index = rig.hands.length; index < this.handBones.length; index += 1) {
      this.handBones[index].forEach((bone) => (bone.visible = false));
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.renderer.setAnimationLoop(null);
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
    this.renderer.dispose();
  }

  private resetPose(): void {
    this.head.position.set(0, 0.76, 0);
    this.head.rotation.set(0, 0, 0);
    this.jaw.scale.y = 0.08;
    this.leftEye.scale.y = 1;
    this.rightEye.scale.y = 1;
    this.bodyBones.forEach((bone) => (bone.visible = false));
    this.handBones.forEach((bones) => bones.forEach((bone) => (bone.visible = false)));
    this.torso.position.set(0, -0.05, 0);
    this.torso.quaternion.identity();
    this.torso.scale.set(1, 1, 1);
  }
}
