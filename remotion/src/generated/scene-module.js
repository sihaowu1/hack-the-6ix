// Denji character reconstruction from reference image
// Zendai scene module — procedural Three.js anime character model

export const PARAMS = {
  /**
   * @tunable
   * @min 0.5 @max 1.5 @step 0.05
   * @label Overall scale
   */
  scale: 1.0,
  /**
   * @tunable
   * @min 0.8 @max 1.2 @step 0.05
   * @label Head size
   */
  headSize: 1.0,
  /**
   * @tunable
   * @min 0.8 @max 1.2 @step 0.05
   * @label Torso height
   */
  torsoHeight: 1.0,
  /**
   * @tunable
   * @label Hair color
   */
  hairColor: '#C88850',
  /**
   * @tunable
   * @label Skin color
   */
  skinColor: '#F5D7B8',
  /**
   * @tunable
   * @label Shirt color
   */
  shirtColor: '#E8E4D8',
  /**
   * @tunable
   * @label Tie color
   */
  tieColor: '#1A1A1A',
  /**
   * @tunable
   * @label Eye color
   */
  eyeColor: '#4A90C8',
  /**
   * @tunable
   * @min 0 @max 1 @step 0.01
   * @label Skin roughness
   */
  skinRoughness: 0.5,
  /**
   * @tunable
   * @min 0 @max 1 @step 0.01
   * @label Shirt roughness
   */
  shirtRoughness: 0.7,
  /**
   * @tunable
   * @min 0 @max 6 @step 0.1
   * @label Key light intensity
   */
  keyLightIntensity: 2.5,
  /**
   * @tunable
   * @label Background
   */
  background: '#87CEEB',
};

export const CAMERA = { position: [0, 2.5, 5], lookAt: [0, 2.2, 0], fov: 35 };

export function buildScene(ctx) {
  const THREE = ctx.THREE;
  const scene = ctx.scene;
  const params = ctx.params;

  scene.background = new THREE.Color(params.background);

  // Root container
  const root = new THREE.Group();
  scene.add(root);

  // ========== TORSO ==========
  const torsoGeometry = new THREE.BoxGeometry(1.2, 1.6, 0.5);
  const shirtMaterial = new THREE.MeshStandardMaterial({
    color: params.shirtColor,
    metalness: 0.0,
    roughness: params.shirtRoughness,
  });
  const torso = new THREE.Mesh(torsoGeometry, shirtMaterial);
  torso.position.y = 1.5;
  root.add(torso);

  // ========== NECK ==========
  const neckGeometry = new THREE.CylinderGeometry(0.18, 0.2, 0.3, 16);
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: params.skinColor,
    metalness: 0.0,
    roughness: params.skinRoughness,
  });
  const neck = new THREE.Mesh(neckGeometry, skinMaterial);
  neck.position.set(0, 2.45, 0);
  root.add(neck);

  // ========== HEAD ==========
  const headGeometry = new THREE.SphereGeometry(0.42, 32, 24);
  const head = new THREE.Mesh(headGeometry, skinMaterial.clone());
  head.scale.set(1, 1.1, 1);
  head.position.set(0, 3.0, 0);
  root.add(head);

  // ========== EYES ==========
  // Left eye white
  const eyeWhiteGeometry = new THREE.SphereGeometry(0.12, 16, 12);
  const eyeWhiteMaterial = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    metalness: 0.0,
    roughness: 0.4,
  });
  const leftEyeWhite = new THREE.Mesh(eyeWhiteGeometry, eyeWhiteMaterial);
  leftEyeWhite.position.set(-0.15, 3.05, 0.35);
  leftEyeWhite.scale.set(1, 0.8, 0.5);
  root.add(leftEyeWhite);

  // Left iris
  const irisGeometry = new THREE.SphereGeometry(0.08, 16, 12);
  const irisMaterial = new THREE.MeshStandardMaterial({
    color: params.eyeColor,
    metalness: 0.0,
    roughness: 0.3,
  });
  const leftIris = new THREE.Mesh(irisGeometry, irisMaterial);
  leftIris.position.set(-0.15, 3.05, 0.42);
  leftIris.scale.set(1, 1, 0.5);
  root.add(leftIris);

  // Left pupil
  const pupilGeometry = new THREE.SphereGeometry(0.04, 12, 8);
  const pupilMaterial = new THREE.MeshStandardMaterial({
    color: '#000000',
    metalness: 0.0,
    roughness: 0.2,
  });
  const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
  leftPupil.position.set(-0.15, 3.05, 0.45);
  root.add(leftPupil);

  // Right eye white
  const rightEyeWhite = new THREE.Mesh(eyeWhiteGeometry, eyeWhiteMaterial.clone());
  rightEyeWhite.position.set(0.15, 3.05, 0.35);
  rightEyeWhite.scale.set(1, 0.8, 0.5);
  root.add(rightEyeWhite);

  // Right iris
  const rightIris = new THREE.Mesh(irisGeometry, irisMaterial.clone());
  rightIris.position.set(0.15, 3.05, 0.42);
  rightIris.scale.set(1, 1, 0.5);
  root.add(rightIris);

  // Right pupil
  const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial.clone());
  rightPupil.position.set(0.15, 3.05, 0.45);
  root.add(rightPupil);

  // ========== HAIR ==========
  const hairMaterial = new THREE.MeshStandardMaterial({
    color: params.hairColor,
    metalness: 0.0,
    roughness: 0.75,
  });

  // Central hair spikes (5 main clumps)
  const hairSpikes = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i - 2) * 0.4;
    const hairGeometry = new THREE.ConeGeometry(0.15, 0.5, 8);
    const hair = new THREE.Mesh(hairGeometry, hairMaterial.clone());
    hair.position.set(Math.sin(angle) * 0.25, 3.5, Math.cos(angle) * 0.2);
    hair.rotation.z = angle * 0.6;
    hair.rotation.x = -0.4;
    root.add(hair);
    hairSpikes.push(hair);
  }

  // Side hair clumps
  const leftSideHair = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.5, 0.25),
    hairMaterial.clone()
  );
  leftSideHair.position.set(-0.35, 3.15, 0.15);
  leftSideHair.rotation.z = -0.3;
  root.add(leftSideHair);

  const rightSideHair = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.5, 0.25),
    hairMaterial.clone()
  );
  rightSideHair.position.set(0.35, 3.15, 0.15);
  rightSideHair.rotation.z = 0.3;
  root.add(rightSideHair);

  // Back hair volume
  const backHairGeometry = new THREE.SphereGeometry(0.38, 16, 16);
  const backHair = new THREE.Mesh(backHairGeometry, hairMaterial.clone());
  backHair.position.set(0, 3.05, -0.25);
  backHair.scale.set(1.1, 0.9, 1);
  root.add(backHair);

  // ========== COLLAR ==========
  const collarGeometry = new THREE.BoxGeometry(0.15, 0.25, 0.05);
  const collarMaterial = new THREE.MeshStandardMaterial({
    color: params.shirtColor,
    metalness: 0.0,
    roughness: 0.7,
  });
  const leftCollar = new THREE.Mesh(collarGeometry, collarMaterial);
  leftCollar.position.set(-0.25, 2.5, 0.22);
  leftCollar.rotation.z = 0.3;
  root.add(leftCollar);

  const rightCollar = new THREE.Mesh(collarGeometry, collarMaterial.clone());
  rightCollar.position.set(0.25, 2.5, 0.22);
  rightCollar.rotation.z = -0.3;
  root.add(rightCollar);

  // ========== TIE ==========
  const tieKnotGeometry = new THREE.BoxGeometry(0.12, 0.1, 0.08);
  const tieMaterial = new THREE.MeshStandardMaterial({
    color: params.tieColor,
    metalness: 0.0,
    roughness: 0.75,
  });
  const tieKnot = new THREE.Mesh(tieKnotGeometry, tieMaterial);
  tieKnot.position.set(0, 2.35, 0.25);
  root.add(tieKnot);

  const tieBodyGeometry = new THREE.BoxGeometry(0.14, 0.8, 0.04);
  const tieBody = new THREE.Mesh(tieBodyGeometry, tieMaterial.clone());
  tieBody.position.set(0, 1.7, 0.27);
  root.add(tieBody);

  // ========== LEFT ARM (behind head pose) ==========
  const leftUpperArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.8, 16),
    shirtMaterial.clone()
  );
  leftUpperArm.position.set(-0.75, 2.1, -0.1);
  leftUpperArm.rotation.z = 1.2;
  leftUpperArm.rotation.x = -0.3;
  root.add(leftUpperArm);

  const leftLowerArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.11, 0.7, 16),
    shirtMaterial.clone()
  );
  leftLowerArm.position.set(-1.0, 2.7, -0.15);
  leftLowerArm.rotation.z = 2.0;
  leftLowerArm.rotation.x = -0.4;
  root.add(leftLowerArm);

  const leftHandGeometry = new THREE.SphereGeometry(0.13, 16, 12);
  const leftHand = new THREE.Mesh(leftHandGeometry, skinMaterial.clone());
  leftHand.position.set(-0.65, 3.3, -0.3);
  leftHand.scale.set(0.8, 1, 0.7);
  root.add(leftHand);

  // ========== RIGHT ARM (behind head pose) ==========
  const rightUpperArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.8, 16),
    shirtMaterial.clone()
  );
  rightUpperArm.position.set(0.75, 2.1, -0.1);
  rightUpperArm.rotation.z = -1.2;
  rightUpperArm.rotation.x = -0.3;
  root.add(rightUpperArm);

  const rightLowerArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.11, 0.7, 16),
    shirtMaterial.clone()
  );
  rightLowerArm.position.set(1.0, 2.7, -0.15);
  rightLowerArm.rotation.z = -2.0;
  rightLowerArm.rotation.x = -0.4;
  root.add(rightLowerArm);

  const rightHand = new THREE.Mesh(leftHandGeometry.clone(), skinMaterial.clone());
  rightHand.position.set(0.65, 3.3, -0.3);
  rightHand.scale.set(0.8, 1, 0.7);
  root.add(rightHand);

  // ========== LIGHTING ==========
  const keyLight = new THREE.DirectionalLight('#ffffff', params.keyLightIntensity);
  keyLight.position.set(4, 8, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight('#B8D4E8', 1.2);
  fillLight.position.set(-3, 4, 2);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight('#FFFFFF', 0.8);
  rimLight.position.set(0, 3, -5);
  scene.add(rimLight);

  const ambientLight = new THREE.AmbientLight('#C8D8E8', 1.0);
  scene.add(ambientLight);

  return {
    root,
    torso,
    neck,
    head,
    leftEyeWhite,
    leftIris,
    leftPupil,
    rightEyeWhite,
    rightIris,
    rightPupil,
    hairSpikes,
    leftSideHair,
    rightSideHair,
    backHair,
    leftCollar,
    rightCollar,
    tieKnot,
    tieBody,
    leftUpperArm,
    leftLowerArm,
    leftHand,
    rightUpperArm,
    rightLowerArm,
    rightHand,
    keyLight,
  };
}

export function updateScene(ctx) {
  const params = ctx.params;
  const objects = ctx.objects;

  // Apply global scale
  objects.root.scale.setScalar(params.scale);

  // Apply head size
  objects.head.scale.set(params.headSize, params.headSize * 1.1, params.headSize);

  // Apply torso height
  const torsoScale = params.torsoHeight;
  objects.torso.scale.y = torsoScale;

  // Update colors
  objects.head.material.color.set(params.skinColor);
  objects.neck.material.color.set(params.skinColor);
  objects.leftHand.material.color.set(params.skinColor);
  objects.rightHand.material.color.set(params.skinColor);

  objects.torso.material.color.set(params.shirtColor);
  objects.leftUpperArm.material.color.set(params.shirtColor);
  objects.leftLowerArm.material.color.set(params.shirtColor);
  objects.rightUpperArm.material.color.set(params.shirtColor);
  objects.rightLowerArm.material.color.set(params.shirtColor);
  objects.leftCollar.material.color.set(params.shirtColor);
  objects.rightCollar.material.color.set(params.shirtColor);

  objects.tieKnot.material.color.set(params.tieColor);
  objects.tieBody.material.color.set(params.tieColor);

  objects.leftIris.material.color.set(params.eyeColor);
  objects.rightIris.material.color.set(params.eyeColor);

  // Update hair color
  for (const spike of objects.hairSpikes) {
    spike.material.color.set(params.hairColor);
  }
  objects.leftSideHair.material.color.set(params.hairColor);
  objects.rightSideHair.material.color.set(params.hairColor);
  objects.backHair.material.color.set(params.hairColor);

  // Update material properties
  objects.head.material.roughness = params.skinRoughness;
  objects.neck.material.roughness = params.skinRoughness;
  objects.leftHand.material.roughness = params.skinRoughness;
  objects.rightHand.material.roughness = params.skinRoughness;

  objects.torso.material.roughness = params.shirtRoughness;
  objects.leftUpperArm.material.roughness = params.shirtRoughness;
  objects.leftLowerArm.material.roughness = params.shirtRoughness;
  objects.rightUpperArm.material.roughness = params.shirtRoughness;
  objects.rightLowerArm.material.roughness = params.shirtRoughness;

  // Update lighting
  objects.keyLight.intensity = params.keyLightIntensity;

  // Update scene background
  ctx.scene.background.set(params.background);
}
