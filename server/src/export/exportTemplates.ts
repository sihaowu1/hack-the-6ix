/**
 * Static file templates for the code-export ZIP: a standalone Three.js viewer
 * (index.html + viewer.js) that runs the exported scene.module.js, plus a
 * README explaining how to use each exported file.
 */

export function viewerHtml(title: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      html, body { margin: 0; height: 100%; background: #0b0d12; }
      canvas { display: block; width: 100vw; height: 100vh; }
    </style>
    <script type="importmap">
      {
        "imports": {
          "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
          "three/addons/": "https://unpkg.com/three@0.170.0/examples/jsm/"
        }
      }
    </script>
  </head>
  <body>
    <canvas id="viewport"></canvas>
    <script type="module" src="./viewer.js"></script>
  </body>
</html>
`;
}

export function viewerJs(): string {
  return `// Standalone viewer for the exported MotionForge scene module.
// Serve this folder over HTTP (e.g. \`npx serve .\`) and open index.html.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as sceneModule from './scene.module.js';

const canvas = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
const spec = sceneModule.CAMERA ?? {};
camera.position.set(...(spec.position ?? [4, 2.6, 5.5]));
if (spec.fov) camera.fov = spec.fov;
camera.updateProjectionMatrix();

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(...(spec.lookAt ?? [0, 0.8, 0]));

const objects = sceneModule.buildScene({ THREE, scene, params: sceneModule.PARAMS });

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const start = performance.now();
renderer.setAnimationLoop((now) => {
  sceneModule.updateScene({
    THREE,
    scene,
    objects,
    params: sceneModule.PARAMS,
    time: (now - start) / 1000,
  });
  controls.update();
  renderer.render(scene, camera);
});
`;
}

export function exportReadme(title: string): string {
  return `# ${title}

Exported from MotionForge — a code-based 3D scene, fully editable.

## Files

- \`scene.module.js\` — the parametric Three.js scene module. \`PARAMS\` holds
  every tunable value; \`buildScene\` constructs the scene; \`updateScene\`
  animates it as a pure function of time.
- \`index.html\` + \`viewer.js\` — a standalone WebGL viewer for the module
  (Three.js is loaded from a CDN via an import map).
- \`scene.blender.py\` — the same scene as a Blender Python script, with
  keyframed animation.

## Run the web viewer

Browsers block ES modules on file:// URLs, so serve the folder over HTTP:

\`\`\`bash
npx serve .
# then open the printed URL (e.g. http://localhost:3000)
\`\`\`

Expected output: the animated 3D scene rendering in your browser with orbit
controls (drag to rotate, scroll to zoom).

## Run the Blender script

Open Blender → Scripting workspace → open \`scene.blender.py\` → Run Script.

Expected output: the scene is rebuilt in Blender with materials, lights, a
camera, and keyframed animation; press Space to play it.

## Tweak it

Edit any value in \`PARAMS\` (in either file) and reload — the code is the
project.
`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
