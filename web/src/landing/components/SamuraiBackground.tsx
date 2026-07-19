import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const PARAMS = {
  headSize: 1,
  torsoWidth: 1,
  shoulderWidth: 1,
  armLength: 1,
  legLength: 1,
  katanaLength: 1,
  katanaPosition: 0.5,
  hornLength: 1,
  armorColor: '#9a1a1a',
  armorLightColor: '#c83838',
  helmetColor: '#851515',
  accentColor: '#d4a055',
  handleColor: '#5a1a1a',
  showWakizashi: true,
};

const ANIMATION = {
  duration: 5.0,
  tracks: [
    { part: 'rightUpperArm', channel: 'rotation', axis: 'x', keyframes: [{ t: 0, v: 0.8 }, { t: 0.8, v: -1.3 }, { t: 2.5, v: -1.0 }, { t: 3.0, v: -0.6 }, { t: 5.0, v: -0.8 }] },
    { part: 'rightUpperArm', channel: 'rotation', axis: 'y', keyframes: [{ t: 0, v: 0 }, { t: 0.8, v: 0 }, { t: 1.5, v: -1.3 }, { t: 2.5, v: -1.9 }, { t: 3.5, v: -0.8 }, { t: 5.0, v: 0.2 }] },
    { part: 'rightUpperArm', channel: 'rotation', axis: 'z', keyframes: [{ t: 0, v: -0.4 }, { t: 0.8, v: 0.6 }, { t: 2.5, v: 0.2 }, { t: 3.5, v: -0.3 }, { t: 5.0, v: -0.5 }] },
    { part: 'rightForearm', channel: 'rotation', axis: 'x', keyframes: [{ t: 0, v: -0.9 }, { t: 0.8, v: -0.2 }, { t: 1.2, v: -0.4 }, { t: 2.5, v: -0.8 }, { t: 3.5, v: -0.3 }, { t: 5.0, v: -0.6 }] },
    { part: 'katanaHandle', channel: 'rotation', axis: 'x', keyframes: [{ t: 0, v: 1.7 }, { t: 0.8, v: 2.6 }, { t: 2.5, v: 2.4 }, { t: 3.5, v: 2.0 }, { t: 5.0, v: 1.5 }] },
    { part: 'torso', channel: 'rotation', axis: 'y', keyframes: [{ t: 0, v: 0 }, { t: 0.8, v: 0 }, { t: 1.2, v: 0.3 }, { t: 2.5, v: -1.6 }, { t: 3.5, v: -0.6 }, { t: 5.0, v: 0 }] },
  ],
};

function sampleKeyframes(keyframes: Array<{ t: number; v: number }>, t: number): number {
  if (keyframes.length === 0) return 0;
  if (t <= keyframes[0].t) return keyframes[0].v;
  const last = keyframes[keyframes.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t || 1);
      return a.v + (b.v - a.v) * f;
    }
  }
  return last.v;
}

function buildSamurai(scene: THREE.Scene) {
  const params = PARAMS;
  const materials = {
    armorPlate: new THREE.MeshStandardMaterial({ color: params.armorColor, roughness: 0.42, metalness: 0.85 }),
    armorPlateLight: new THREE.MeshStandardMaterial({ color: params.armorLightColor, roughness: 0.38, metalness: 0.88 }),
    helmetMetal: new THREE.MeshStandardMaterial({ color: params.helmetColor, roughness: 0.35, metalness: 0.9 }),
    helmetAccent: new THREE.MeshStandardMaterial({ color: params.accentColor, roughness: 0.25, metalness: 0.8 }),
    bladeMetal: new THREE.MeshStandardMaterial({ color: '#c8d0d8', roughness: 0.12, metalness: 0.95 }),
    guardMetal: new THREE.MeshStandardMaterial({ color: '#4a4a52', roughness: 0.3, metalness: 0.88 }),
    handleWrap: new THREE.MeshStandardMaterial({ color: params.handleColor, roughness: 0.85, metalness: 0.0 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#1a1a1e', roughness: 0.9, metalness: 0.0 }),
    cordWrap: new THREE.MeshStandardMaterial({ color: '#6b5842', roughness: 0.88, metalness: 0.0 }),
  };

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), materials.armorPlate);
  torso.position.set(0, 1.3, 0);
  scene.add(torso);

  const chestPlateUpper = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.25, 0.32), materials.armorPlateLight);
  chestPlateUpper.position.set(0, 0.25, 0);
  torso.add(chestPlateUpper);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), materials.helmetMetal);
  head.position.set(0, 0.55, 0);
  torso.add(head);

  const helmetBowl = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.15, 16), materials.helmetMetal);
  helmetBowl.position.set(0, 0.18, 0);
  head.add(helmetBowl);

  const helmetHornLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.05), materials.helmetAccent);
  helmetHornLeft.position.set(-0.15, 0.25, 0);
  helmetHornLeft.rotation.set(0, 0, -0.3);
  head.add(helmetHornLeft);

  const helmetHornRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.05), materials.helmetAccent);
  helmetHornRight.position.set(0.15, 0.25, 0);
  helmetHornRight.rotation.set(0, 0, 0.3);
  head.add(helmetHornRight);

  const faceMask = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.12), materials.armorPlate);
  faceMask.position.set(0, -0.05, 0.11);
  head.add(faceMask);

  const shoulderLeft = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.28), materials.armorPlateLight);
  shoulderLeft.position.set(-0.38, 0.28, 0);
  torso.add(shoulderLeft);

  const shoulderRight = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.28), materials.armorPlateLight);
  shoulderRight.position.set(0.38, 0.28, 0);
  torso.add(shoulderRight);

  const leftUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.4, 16), materials.fabric);
  leftUpperArm.position.set(0, -0.3, 0);
  leftUpperArm.rotation.set(0, 0, 0.2);
  shoulderLeft.add(leftUpperArm);

  const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.38, 16), materials.armorPlate);
  leftForearm.position.set(0.1, -0.35, 0);
  leftForearm.rotation.set(0, 0, -0.5);
  leftUpperArm.add(leftForearm);

  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), materials.fabric);
  leftHand.position.set(0, -0.22, 0);
  leftForearm.add(leftHand);

  const rightUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.4, 16), materials.fabric);
  rightUpperArm.position.set(0, -0.3, 0);
  rightUpperArm.rotation.set(0.8, 0, -0.2);
  shoulderRight.add(rightUpperArm);

  const rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.38, 16), materials.armorPlate);
  rightForearm.position.set(0, -0.35, 0);
  rightForearm.rotation.set(-0.9, 0, 0);
  rightUpperArm.add(rightForearm);

  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), materials.fabric);
  rightHand.position.set(0, -0.22, 0);
  rightForearm.add(rightHand);

  const katanaHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 12), materials.handleWrap);
  katanaHandle.position.set(0, 0.1, 0);
  katanaHandle.rotation.set(1.7, 0, 0);
  rightHand.add(katanaHandle);

  const katanaGuard = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 12, 16), materials.guardMetal);
  katanaGuard.position.set(0, 0.18, 0);
  katanaGuard.rotation.set(1.5708, 0, 0);
  katanaHandle.add(katanaGuard);

  const katanaBlade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 0.008), materials.bladeMetal);
  katanaBlade.position.set(0, 0.73, 0);
  katanaHandle.add(katanaBlade);

  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.25, 16), materials.armorPlate);
  waist.position.set(0, -0.48, 0);
  torso.add(waist);

  const hipArmorFront = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.35, 0.08), materials.armorPlateLight);
  hipArmorFront.position.set(0, -0.25, 0.18);
  hipArmorFront.rotation.set(0.15, 0, 0);
  waist.add(hipArmorFront);

  const hipArmorBack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.35, 0.08), materials.armorPlateLight);
  hipArmorBack.position.set(0, -0.25, -0.18);
  hipArmorBack.rotation.set(-0.15, 0, 0);
  waist.add(hipArmorBack);

  const hipArmorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.25), materials.armorPlateLight);
  hipArmorLeft.position.set(-0.22, -0.25, 0);
  hipArmorLeft.rotation.set(0, 0, -0.12);
  waist.add(hipArmorLeft);

  const hipArmorRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.25), materials.armorPlateLight);
  hipArmorRight.position.set(0.22, -0.25, 0);
  hipArmorRight.rotation.set(0, 0, 0.12);
  waist.add(hipArmorRight);

  const wakizashiSheath = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), materials.armorPlate);
  wakizashiSheath.position.set(-0.25, 0.05, 0.12);
  wakizashiSheath.rotation.set(0, 0, -0.6);
  waist.add(wakizashiSheath);

  const leftUpperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.5, 16), materials.fabric);
  leftUpperLeg.position.set(-0.15, -0.5, 0);
  leftUpperLeg.rotation.set(0, 0, 0.1);
  waist.add(leftUpperLeg);

  const leftKneePad = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), materials.armorPlate);
  leftKneePad.position.set(0, -0.28, 0);
  leftUpperLeg.add(leftKneePad);

  const leftLowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.48, 16), materials.armorPlateLight);
  leftLowerLeg.position.set(0.05, -0.68, 0);
  leftLowerLeg.rotation.set(0, 0, -0.15);
  leftUpperLeg.add(leftLowerLeg);

  const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.25), materials.armorPlate);
  leftFoot.position.set(0, -0.28, 0.06);
  leftLowerLeg.add(leftFoot);

  const rightUpperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.5, 16), materials.fabric);
  rightUpperLeg.position.set(0.15, -0.5, 0);
  rightUpperLeg.rotation.set(0, 0, -0.1);
  waist.add(rightUpperLeg);

  const rightKneePad = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), materials.armorPlate);
  rightKneePad.position.set(0, -0.28, 0);
  rightUpperLeg.add(rightKneePad);

  const rightLowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.48, 16), materials.armorPlateLight);
  rightLowerLeg.position.set(-0.05, -0.68, 0);
  rightLowerLeg.rotation.set(0, 0, 0.15);
  rightUpperLeg.add(rightLowerLeg);

  const rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.25), materials.armorPlate);
  rightFoot.position.set(0, -0.28, 0.06);
  rightLowerLeg.add(rightFoot);

  const chestCord = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.015, 8, 16), materials.cordWrap);
  chestCord.position.set(0, 0.1, 0.16);
  torso.add(chestCord);

  // Lighting
  const keyLight = new THREE.DirectionalLight('#ffffff', 2.8);
  keyLight.position.set(4.5, 5, 3.5);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight('#e8f0ff', 0.7);
  fillLight.position.set(-3, 2, 2.5);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight('#ffffff', 1.4);
  rimLight.position.set(-2, 3.5, -4);
  scene.add(rimLight);

  const ambientLight = new THREE.AmbientLight('#d0d8e0', 0.28);
  scene.add(ambientLight);

  return {
    torso, chestPlateUpper, head, helmetBowl, helmetHornLeft, helmetHornRight, faceMask,
    shoulderLeft, shoulderRight, leftUpperArm, leftForearm, leftHand,
    rightUpperArm, rightForearm, rightHand, katanaHandle, katanaGuard, katanaBlade,
    waist, hipArmorFront, hipArmorBack, hipArmorLeft, hipArmorRight, wakizashiSheath,
    leftUpperLeg, leftKneePad, leftLowerLeg, leftFoot,
    rightUpperLeg, rightKneePad, rightLowerLeg, rightFoot, chestCord,
    materials,
  };
}

function updateAnimation(objects: Record<string, any>, time: number) {
  const tSec = Math.min(Math.max(time, 0), ANIMATION.duration);
  for (const track of ANIMATION.tracks) {
    const part = objects[track.part];
    if (!part) continue;
    const v = sampleKeyframes(track.keyframes, tSec);
    if (track.channel === 'rotation') {
      (part.rotation as any)[track.axis] = v;
    }
  }
}

export default function SamuraiScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    objects: Record<string, any>;
    frameId: number;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;

    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 100);
    camera.position.set(2.8, 1.6, 3.8);
    camera.lookAt(0, 1.1, 0);

    const objects = buildSamurai(scene);
    stateRef.current = { renderer, scene, camera, objects, frameId: 0 };

    const onResize = () => {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      renderer.setSize(rw, rh);
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
    };

    const animate = () => {
      // Scroll-based animation: map section visibility to animation time
      const rect = container.getBoundingClientRect();
      const viewH = window.innerHeight;
      // progress: 0 when section enters viewport from bottom, 1 when it exits top
      const progress = Math.min(Math.max((viewH - rect.top) / (viewH + rect.height), 0), 1);
      const time = progress * ANIMATION.duration;

      updateAnimation(objects, time);

      // Gentle camera orbit
      const angle = -0.3 + progress * 0.6;
      const radius = 4.2;
      camera.position.x = Math.sin(angle) * radius;
      camera.position.z = Math.cos(angle) * radius;
      camera.position.y = 1.5;
      camera.lookAt(0, 1.1, 0);

      renderer.render(scene, camera);
      stateRef.current!.frameId = requestAnimationFrame(animate);
    };

    window.addEventListener('resize', onResize);
    animate();

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(stateRef.current!.frameId);
      renderer.dispose();
      stateRef.current = null;
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute top-0 right-0 h-full w-full" />
      {/* Fade edges into the dark background */}
      <div className="absolute inset-0 bg-gradient-to-r from-inkwell via-transparent to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-inkwell/80 via-transparent to-inkwell/60" />
    </div>
  );
}
