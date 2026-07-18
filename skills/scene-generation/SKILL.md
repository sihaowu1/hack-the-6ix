---
name: scene-generation
description: Generate and modify parametric 3D scenes as code. Produces a Three.js scene module with tunable, annotated parameters plus a matching Blender Python script from a natural-language prompt. Use whenever creating or editing 3D models, scenes, or animations in MotionForge.
---

# 3D Scene Generation Skill

You generate 3D models, scenes, and animations **as code** — never as images or
via a video-generation service. Every scene is expressed twice, from the same
design: once as a Three.js/WebGL scene module (rendered live in the editor and
by the Remotion MP4 pipeline) and once as a Blender Python script (executed in
Blender through MCP).

## Response format

Return exactly two fenced code blocks, in this order (brief prose around them
is fine, no other code blocks):

1. A ` ```javascript ` block — the Three.js scene module (`scene.module.js`).
2. A ` ```python ` block — the Blender script (`scene.blender.py`).

## Three.js scene module contract

The module is executed in a sandbox that supplies everything it needs. It must
be completely self-contained:

- **No `import`, `require`, or `fetch`.** The host passes `THREE` in.
- Export exactly these members:
  - `export const PARAMS = { ... }` — every tunable value (see Tunables below).
  - `export const CAMERA = { position: [x, y, z], lookAt: [x, y, z], fov }` —
    optional but strongly recommended so the framing is intentional.
  - `export function buildScene({ THREE, scene, params })` — creates lights,
    materials, and objects, adds them to `scene`, and **returns an object map**
    of everything `updateScene` needs, e.g. `return { body, ring, keyLight }`.
  - `export function updateScene({ THREE, scene, objects, params, time })` —
    the animation. `time` is seconds.
- `updateScene` must be a **pure function of `time`**: the same `time` must
  always produce the same pose. No `Math.random()` (inline a seeded PRNG if you
  need noise), no `Date`, no accumulating state between calls. This is required
  because the Remotion renderer draws frames independently and out of order.
- Prefer motions built from `Math.sin`/`Math.cos` of `time` so animations loop
  cleanly.
- Keep geometry modest (under ~50k triangles). Use `MeshStandardMaterial` and
  include at least one directional/point light plus a soft ambient light.
- Read every visual constant through `params.<name>` — never duplicate a value
  that also lives in PARAMS.

## Tunables

Every value a user might want to tweak must live in `PARAMS` with a JSDoc
annotation. The editor parses these annotations to build sliders and switches:

```javascript
export const PARAMS = {
  /**
   * @tunable
   * @min 0.2 @max 3 @step 0.05
   * @label Sphere radius
   */
  radius: 1,
  /**
   * @tunable
   * @label Rotate
   */
  rotate: true,
  /**
   * @tunable
   * @label Body color
   */
  bodyColor: '#4f8ef7',
};
```

Rules:

- **Numbers** must include `@min`, `@max`, and `@step` → rendered as sliders.
- **Booleans** need only `@tunable` (plus optional `@label`) → rendered as
  switches.
- **Colors** are single-quoted hex strings (`'#rrggbb'`) → rendered as color
  pickers.
- 6–14 tunables is the sweet spot; every one must actually affect the scene.

## Blender script contract

- Pure `bpy` plus the Python standard library (`math`). No external add-ons,
  no file I/O, no network access.
- Start with a `PARAMS = { ... }` dict mirroring the Three.js PARAMS
  (snake_case keys), so the two representations stay tunable in parallel.
- Clear the default scene objects first, then build the same scene: meshes,
  Principled BSDF materials, lights, and a camera.
- Animate with keyframes that match `updateScene`: set
  `scene.render.fps = PARAMS["fps"]` and
  `scene.frame_end = int(fps * PARAMS["duration_seconds"])`, then sample the
  same motion equations every 2–5 frames and insert keyframes.
- The script must run as-is via `execute_blender_code` or Blender's Text
  Editor, and must end with a short `print(...)` confirming what was built.

## Modify mode

When you are given the current module code plus a change request, return the
**complete updated** blocks (never diffs or fragments). Preserve existing
parameter names and values unless the request changes them.

## Blender agent mode (MCP tools available)

When the `execute_blender_code`, `get_scene_info`, and `render_frame` tools
are available, work iteratively against the live Blender instance: inspect the
scene first, execute focused chunks of Python (each under ~100 lines), read
the tool output, and fix any errors you caused before finishing. End with a
one-paragraph summary of what you built or changed.
