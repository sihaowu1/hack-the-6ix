import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { validateSceneModule, type SceneModule } from '@motionforge/shared';

/** A clicked object's position (units) and Y-axis rotation (degrees). */
export interface ObjectTransform {
  x: number;
  y: number;
  z: number;
  angle: number;
}

/**
 * Bound to the specific object that was clicked. Reading/writing through this
 * — rather than exposing the `THREE.Object3D` itself — keeps the manual
 * position/rotation override entirely inside the runtime: it never touches
 * PARAMS, generated code, or the AI agent, and it survives `updateScene`
 * running every frame (see `SceneRuntime`'s render loop).
 */
export interface ObjectHandle {
  getTransform(): ObjectTransform;
  setTransform(transform: ObjectTransform): void;
}

/**
 * Live WebGL preview runtime. The editor's code string is hot-loaded as a real
 * ES module (Blob URL import), then buildScene/updateScene run against a
 * Three.js renderer with orbit controls. Any code change rebuilds the scene.
 */
export class SceneRuntime {
  onError: (err: Error) => void = () => {};
  /** Fired when a raycast click hits any object in the scene (not empty space). */
  onObjectClick: (point: { x: number; y: number }, handle: ObjectHandle) => void = () => {};

  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private scene = new THREE.Scene();
  private module: SceneModule | null = null;
  private objects: unknown = null;
  private raf = 0;
  private startMs = performance.now();
  private frameErrorReported = false;
  /** When set, `updateScene` is driven by this instead of the free-running wall clock (see `setTime`). */
  private controlledTime: number | null = null;
  private raycaster = new THREE.Raycaster();
  private pointerDownPos: { x: number; y: number } | null = null;
  /**
   * Manual position/rotation overrides set by clicking an object and dragging
   * its transform sliders. Re-applied after `updateScene` every frame (see
   * `loop`) so they hold even against an animated object's own per-frame
   * position assignment. Cleared on every rebuild since the objects it keys
   * on are disposed then.
   */
  private transformOverrides = new Map<THREE.Object3D, ObjectTransform>();
  /**
   * Manual camera position/yaw override set via the "Camera" editor. Unlike
   * `transformOverrides`, this must be re-applied *after* `controls.update()`
   * every frame — `OrbitControls` recomputes the camera's position/orientation
   * from its own internal spherical state and target on every call, which
   * would otherwise stomp a direct `camera.position`/`camera.rotation` write.
   * `controls.enabled` is turned off while this is set so a mouse drag over
   * the canvas can't fight the sliders, and restored on `clearCameraOverride`.
   */
  private cameraOverride: ObjectTransform | null = null;
  /** Toggled by the "Axes" button — persists across `setCode` rebuilds (the helper is re-added to each fresh `THREE.Scene`), reset only when a new `SceneRuntime` is constructed. */
  private axesVisible = false;
  private axesHelper: THREE.AxesHelper | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.camera.position.set(4, 2.6, 5.5);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.8, 0);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointerup', this.handlePointerUp);
  }

  async setCode(code: string): Promise<void> {
    const errors = validateSceneModule(code);
    if (errors.length > 0) throw new Error(errors.join('; '));
    this.module = await loadSceneModule(code);
    this.frameErrorReported = false;
    this.rebuild();
  }

  /**
   * Hands the scene's `time` to the caller (e.g. a timeline playhead)
   * instead of the internal wall clock — a fixed `time` freezes the scene on
   * that exact frame, since `updateScene` must already be pure in `time`.
   */
  setTime(time: number): void {
    this.controlledTime = time;
  }

  resize(width: number, height: number): void {
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.controls.dispose();
    disposeScene(this.scene);
    this.renderer.dispose();
  }

  // Tracked as pointerdown/up (not a native `click`) so an orbit-drag that
  // happens to start and end over the canvas isn't mistaken for a click.
  private handlePointerDown = (event: PointerEvent): void => {
    this.pointerDownPos = { x: event.clientX, y: event.clientY };
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const down = this.pointerDownPos;
    this.pointerDownPos = null;
    if (!down) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return;
    this.handleCanvasClick(event.clientX, event.clientY);
  };

  private handleCanvasClick(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    if (hits.length > 0) {
      const object = this.topLevelAncestor(hits[0].object);
      this.onObjectClick(
        { x: clientX, y: clientY },
        {
          getTransform: () => this.getObjectTransform(object),
          setTransform: (transform) => this.setObjectTransform(object, transform),
        },
      );
    }
  }

  /** Walks up to whatever `buildScene` added directly to `this.scene` — moving that, not a sub-mesh, is what "the clicked object" means for compound objects. */
  private topLevelAncestor(object: THREE.Object3D): THREE.Object3D {
    let node = object;
    while (node.parent && node.parent !== this.scene) node = node.parent;
    return node;
  }

  private getObjectTransform(object: THREE.Object3D): ObjectTransform {
    return {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
      angle: THREE.MathUtils.radToDeg(object.rotation.y),
    };
  }

  private setObjectTransform(object: THREE.Object3D, transform: ObjectTransform): void {
    this.transformOverrides.set(object, transform);
    object.position.set(transform.x, transform.y, transform.z);
    object.rotation.y = THREE.MathUtils.degToRad(transform.angle);
  }

  /** Handle for the "Camera" editor — mirrors `ObjectHandle` so the same `TransformControls` UI works for both. */
  getCameraHandle(): ObjectHandle {
    return {
      getTransform: () => this.getCameraTransform(),
      setTransform: (transform) => this.setCameraTransform(transform),
    };
  }

  /** Hands manual camera control back to `OrbitControls`, e.g. when the camera editor popover closes. */
  clearCameraOverride(): void {
    this.cameraOverride = null;
    this.controls.enabled = true;
  }

  private getCameraTransform(): ObjectTransform {
    return {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
      angle: THREE.MathUtils.radToDeg(this.camera.rotation.y),
    };
  }

  private setCameraTransform(transform: ObjectTransform): void {
    this.cameraOverride = transform;
    this.controls.enabled = false;
    this.applyCameraOverride();
  }

  private applyCameraOverride(): void {
    const transform = this.cameraOverride;
    if (!transform) return;
    this.camera.position.set(transform.x, transform.y, transform.z);
    this.camera.rotation.set(0, THREE.MathUtils.degToRad(transform.angle), 0);
  }

  /** Shows/hides the red/green/blue X/Y/Z reference axes at the scene origin. */
  setAxesVisible(visible: boolean): void {
    this.axesVisible = visible;
    this.syncAxesHelper();
  }

  getAxesVisible(): boolean {
    return this.axesVisible;
  }

  /** Re-adds the (single, reused) helper to whatever the current `this.scene` is — needed after every rebuild, since `disposeScene`/reassignment discards the previous scene's children. */
  private syncAxesHelper(): void {
    if (!this.axesVisible) {
      if (this.axesHelper) this.scene.remove(this.axesHelper);
      return;
    }
    if (!this.axesHelper) this.axesHelper = new THREE.AxesHelper(10);
    if (this.axesHelper.parent !== this.scene) this.scene.add(this.axesHelper);
  }

  private rebuild(): void {
    // Spare the reused axes helper from disposal — it's about to be re-added to the fresh scene, not thrown away.
    if (this.axesHelper) this.scene.remove(this.axesHelper);
    disposeScene(this.scene);
    this.scene = new THREE.Scene();
    this.transformOverrides.clear();
    this.clearCameraOverride();
    this.syncAxesHelper();
    const module = this.module;
    if (!module) return;
    const camera = module.CAMERA;
    if (camera?.position) this.camera.position.set(...camera.position);
    if (camera?.fov) {
      this.camera.fov = camera.fov;
      this.camera.updateProjectionMatrix();
    }
    if (camera?.lookAt) this.controls.target.set(...camera.lookAt);
    try {
      this.objects = module.buildScene({ THREE, scene: this.scene, params: module.PARAMS });
    } catch (err) {
      this.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private loop(now: number): void {
    const module = this.module;
    if (module) {
      try {
        module.updateScene({
          THREE,
          scene: this.scene,
          objects: this.objects,
          params: module.PARAMS,
          time: this.controlledTime !== null ? this.controlledTime : (now - this.startMs) / 1000,
        });
      } catch (err) {
        if (!this.frameErrorReported) {
          this.frameErrorReported = true;
          this.onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
    // Re-assert manual overrides after updateScene, which may have just
    // written its own position/rotation for this frame.
    for (const [object, transform] of this.transformOverrides) {
      object.position.set(transform.x, transform.y, transform.z);
      object.rotation.y = THREE.MathUtils.degToRad(transform.angle);
    }
    this.controls.update();
    // Applied after controls.update() (not folded into the transformOverrides
    // loop above), since that call would otherwise overwrite our direct
    // camera position/rotation write with its own target-relative one.
    this.applyCameraOverride();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  }
}

async function loadSceneModule(code: string): Promise<SceneModule> {
  const blob = new Blob([code], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    return (await import(/* @vite-ignore */ url)) as SceneModule;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}
