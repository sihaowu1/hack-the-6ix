---
name: scene-blocking
description: Turn a prompt's spatial language ("X next to Y", "Z in the background", "a field of…", "towering over") into concrete object coordinates inside buildScene, on a shared ground plane with correct resting heights and scale. Use together with threejs-modelling (and camera-composition) whenever building a Zendai model that stages more than a single centered object.
---

# Scene Blocking Skill

Zendai has no set dresser and no image model — where objects sit in the frame is
decided entirely by the coordinates you write in `buildScene`. This skill turns a
natural-language prompt into deliberate placement. It governs **where things go**;
the companion `camera-composition` skill decides **where the camera goes**, and
`threejs-modelling` governs the module contract/export format. Emit object
positions inside `buildScene` only — never a `CAMERA` export from this skill.

## Coordinate system

Three.js in this project: **Y-up, right-handed**. The ground plane is `y = 0`;
objects rest **on** it (offset each object's `y` by its own half-height, not by
`0`). Depth runs along `z`; left/right along `x`.

## Step 1 — Extract the blocking from the prompt

Read the prompt for two kinds of information, even when it's terse:

1. **Subjects** — what objects/models exist. A prompt with one noun ("a red
   cube") still needs a ground plane or environment to read as staged, not
   floating in a void, unless the prompt implies emptiness (space/abstract).
2. **Spatial relationships** — words like "next to", "behind", "above",
   "orbiting", "in a row", "scattered", "towering over". Convert these directly
   into coordinates:
   - "next to / beside" → same `y`, offset on `x` (or `z`) by roughly
     `sum of radii * 1.2` so shapes don't intersect.
   - "behind / in front of" → offset along the axis the camera looks down,
     i.e. increase separation along whichever axis is closer to the
     camera-to-lookAt direction.
   - "above / stacked on" → offset on `y` by the supporting object's height.
   - "orbiting / circling" → parametrize position with `Math.sin`/`Math.cos`
     of `time` at a fixed radius (this is animation, but it changes how much
     clearance the neighbours and camera need).
   - "scattered / a field of" → distribute with a **seeded** pseudo-random
     placement (never `Math.random()` — `updateScene`/`buildScene` must stay
     deterministic per the threejs-modelling contract) over a bounded area.

## Step 2 — Keep placements collision-free and grounded

- Two subjects should not interpenetrate at rest: keep centre-to-centre distance
  `>= (rA + rB) * 1.2` along the separating axis, where `r` is each subject's
  bounding radius.
- Every subject's lowest point stays at `y >= 0`. Compute the resting offset as
  `y = halfHeight` so the base touches the plane; a subject that is `H` tall and
  modelled centred at its origin sits at `y = H/2`.
- Center the whole arrangement around the origin so the camera framing has a
  natural target: spread subjects symmetrically about `x = 0` where possible.

## Step 3 — Place ground/scale references when useful

A shot with no ground plane, floor, or reference object reads as "floating in a
void" — fine for space/abstract scenes, wrong for "a car in a parking lot" or
anything with an implied "above/below" relationship. Add a simple ground plane
(`PlaneGeometry` + `MeshStandardMaterial`) at `y = 0` when the blocking depends
on a surface, and rest each subject on it, so a "from below" or "towering over"
shot has visible ground to establish scale against.

## Worked example (blocking half)

Prompt: *"A small robot standing next to a tall lighthouse."*

1. Subjects: robot (small, `r ≈ 0.4`), lighthouse (tall, `~6` units, `r ≈ 1`).
2. Relationship: "next to" → offset the robot from the lighthouse base by
   `~1.5` units on `x`, both resting on `y = 0` (robot at `y = its halfHeight`,
   lighthouse at `y = 3` if modelled centred).
3. Center the pair around `x = 0`: lighthouse at `x ≈ -0.75`, robot at
   `x ≈ 0.75`, so the framing target sits between them.

Hand the resulting span (centre `C`, radius `r`) to `camera-composition` for the
shot; this skill stops at the coordinates.

## Output

Apply this reasoning silently and emit the placement as object positions inside
`buildScene`. Do not narrate the geometry math beyond a short note unless asked,
and do not emit a `CAMERA` export — that belongs to `camera-composition`.
