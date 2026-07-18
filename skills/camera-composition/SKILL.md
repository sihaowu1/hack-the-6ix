---
name: camera-composition
description: Turn a user's prompt into a concrete camera position/lookAt/fov so the rendered frame actually shows what was asked for. Use whenever building or reframing a Zendai model — especially when the prompt implies a shot type ("close-up", "from above", "wide shot"). Object placement is handled by the scene-blocking skill; this skill only decides and emits CAMERA.
---

# Camera Skill

Zendai has no camera operator and no image model to lean on — what appears in the
frame is decided by where objects sit (see the `scene-blocking` skill) and where
you put the camera (`CAMERA`). This skill turns a natural-language prompt into a
deliberate camera, instead of leaving it at a generic default that happens to
point at the origin.

This skill governs **the camera only**. Object placement/blocking is the
`scene-blocking` skill's job, and the module contract/export format is
`threejs-modelling`'s. When you are reframing an existing scene, change `CAMERA`
and nothing else.

## Coordinate system

Three.js in this project: **Y-up, right-handed**. `CAMERA` (see
`shared/src/types.ts`) supports exactly three fields — treat anything not on
this list as unavailable:

```ts
CAMERA = { position: [x, y, z], lookAt: [x, y, z], fov?: number };
```

- `position` — where the camera sits.
- `lookAt` — the point the camera aims at (defines forward direction).
- `fov` — vertical field of view in degrees (default ~50 if omitted).
- **No roll/tilt/up-vector control.** The camera never rolls sideways (no
  "Dutch angle"). If a prompt asks for a canted/tilted horizon, say so isn't
  supported and produce the closest supported framing (e.g. a low or high
  angle) instead of silently ignoring the request.

## Aspect ratio

The generation request tells you the target preview aspect ratio (`16:9`,
`1:1`, or `4:3` — see `AspectRatio` in `shared/src/types.ts`). This is a
composition input, not something you emit: it never becomes a PARAMS value or
a code comment about pixels/resolution. Two things follow from it:

1. **Acknowledge it.** Open your response with one short sentence naming the
   ratio you're composing for (e.g. "Composing for 16:9." or "Building a
   square 1:1 frame."), before the code fences.
2. **Use it for the frame check below.** `CAMERA.fov` is *vertical* FOV;
   the frame is only as wide as `hfov = 2·atan(tan(vfov/2) · aspect)`, where
   `aspect = width/height` (16/9 ≈ 1.78, 1:1 = 1, 4:3 ≈ 1.33). A composition
   that clears the vertical check can still clip subjects on the sides in a
   narrower ratio, or leave awkward empty space on the sides in a wider one —
   check both axes, not just the cone approximation.
   - Wide ratios (16:9): more horizontal room than vertical — good for
     side-by-side subjects, horizon shots, establishing shots.
   - Square (1:1) and narrower (4:3): less horizontal margin — prefer
     centering the subject rather than spreading elements sideways.

**This choice is made once, at generation time, and is not revisited.** If
the user later changes the aspect-ratio dropdown without re-prompting, the
scene module is not regenerated — the same `PARAMS`, `buildScene`, and
`CAMERA` keep running unchanged, and only the visible crop changes (an object
at `(1, 0, 0)` that was in frame at 16:9 may fall outside the frame at 1:1;
that is expected, not a bug to fix). Don't add logic to `buildScene` or
`updateScene` that reads or reacts to aspect ratio — the module has no way to
know it changed, and isn't supposed to.

## Step 1 — Read the shot type and the subject span

From the prompt, extract the **shot type** — explicit ("close-up", "wide shot",
"overhead", "from below", "over-the-shoulder"-style framing) or implied by mood
("epic", "intimate", "looming", "dwarfed by"). If the prompt gives no shot type,
default to a **3/4 eye-level establishing shot** (see table). Even for a simple
prompt ("a spinning cube"), pick a deliberate, flattering angle (3/4 high shot)
rather than a dead-on front view, which looks flat and hides depth.

Then read the scene you are framing: its subject center `C` and bounding radius
`r`. `r` is the approximate radius of the bounding sphere around whatever the
shot frames — for a single 1-unit-radius sphere `r = 1`; for several objects
spread over a 6-unit area `r ≈ 3`. When in doubt, compute `r` as half the largest
span between any two subjects, plus each subject's own size.

## Step 2 — Translate shot type to camera geometry

| Prompt language | position relative to subject center `C` and its bounding radius `r` | lookAt | fov |
|---|---|---|---|
| Default / establishing / "wide shot" | `C + [2.2r, 1.4r, 2.2r]` (3/4, slightly above) | `C` | 45–55 |
| "close-up" / "macro" / "detail shot" | `C + [0.6r, 0.3r, 0.9r]` | `C` (or the specific sub-part) | 35–45 |
| "from above" / "overhead" / "bird's-eye" | `C + [0, 3.5r, 0.3r]` (mostly vertical, tiny z offset so `lookAt` isn't degenerate) | `C` | 45–60 |
| "from below" / "low angle" / "looming" / "towering" | `C + [1.5r, -0.4r, 1.5r]` (only if the scene has room below `y=0`; otherwise `C + [1.8r, 0.15r, 1.8r]`) | `C + [0, 0.3r, 0]` (aim slightly up the subject) | 50–65 |
| "front view" / "head-on" | `C + [0, 0.5r, 3r]` | `C` | 40–50 |
| "side view" / "profile" | `C + [3r, 0.5r, 0]` | `C` | 40–50 |
| "epic" / "dramatic" / "hero shot" | low angle + wide fov: `C + [2r, -0.2r, 2.5r]`, fov 60–70 | `C + [0, 0.5r, 0]` | 60–70 |
| "intimate" / "isolated" / centered subject | close-up position, narrow fov 25–35 for compression | `C` | 25–35 |
| "wide establishing" / "landscape" / "environment" | pull back further: `C + [4r, 2r, 4r]` | `C` | 55–70 |

Keep the camera above `y = 0` for floor-based scenes (clamp a low-angle position
up rather than putting the camera underground).

## Step 3 — Verify the frame, don't just guess

Before finalizing `CAMERA`, sanity-check with the standard framing distance
formula so subjects aren't clipped or lost in empty space. Check the *vertical*
axis with the table's `fov` directly, and the *horizontal* axis with the
aspect-derived `hfov` from the Aspect ratio section — the two diverge as soon as
the ratio isn't square:

```
vDistance ≈ (subjectHeight / 2) / tan(vfov_in_radians / 2) * margin
hDistance ≈ (subjectWidth  / 2) / tan(hfov_in_radians / 2) * margin
distance  ≈ max(vDistance, hDistance)
```

Use `margin ≈ 1.3–1.8` (tighter for close-ups, looser for wide/establishing
shots) so the subject fills a pleasing fraction of the frame without touching
the edges. If multiple subjects are in play, `subjectWidth`/`subjectHeight`
are the full span across all of them (plus each subject's own diameter), not
just one object. Taking the `max` of the two ensures the tighter axis — the
one actually at risk of clipping for this ratio — sets the distance.

Mentally trace the ray from `position` to `lookAt`: everything the prompt
calls "in the shot" should lie roughly within a cone of half-angle `vfov/2`
vertically and `hfov/2` horizontally around that ray, at a range of distances
the camera can actually resolve.

## Worked example

Prompt: *"…camera looking up at the lighthouse like it's towering over
everything."* (a ~6-unit-tall lighthouse next to a small robot, already blocked).

1. Shot type: "towering over" + "looking up at" → low-angle row in the table.
   Lighthouse center for framing purposes ≈ `[0, 3, 0]` (half its height).
2. Camera: a naive `position: [2.5, -0.3, 2.5]` is below the floor — clamp above
   `y = 0`, so use `position: [2.2, 0.4, 2.2]`, `lookAt: [0, 4.5, 0]` (aim above
   center, up the tower), `fov: 60` for the exaggerated, looming perspective.
3. Verify: subject height ≈ 6, `tan(30°) ≈ 0.577`, `vDistance ≈ (6/2)/0.577*1.3
   ≈ 6.75`. At 16:9, `hfov = 2·atan(tan(30°)·1.78) ≈ 50.5°`, span width ≈ 2,
   `hDistance ≈ (2/2)/tan(25.3°)*1.3 ≈ 2.75` — vertical dominates, so 16:9 has
   spare horizontal room. A deliberately tight, exaggerated low angle is what
   "towering over" asks for, not a comfortable establishing shot.

## Framing an already-animated / multi-subject scene

You may be called **after** the motion is decided, to frame a scene that already
has an `ANIMATION` export and (for merges) several subjects fused together.

- **Frame the full span of all subjects.** Compute `C` and `r` from the bounding
  box around **every** subject in the scene, not one of them, so nobody is
  clipped as they move. Account for the animation: if a subject swings an arm or
  strides forward, include the extremal pose in the span you frame.
- **Do not rewrite the motion or geometry.** Preserve `ANIMATION`, `buildScene`,
  and `updateScene`; change `CAMERA` only.
- When asked to return **only** a `CAMERA` export (fused merge camera pass),
  emit a single ```javascript block with exactly
  `export const CAMERA = { position: [...], lookAt: [...], fov: ... };` and
  nothing else — the host splices it into the fused module.

## Output

Open with one short sentence acknowledging the target aspect ratio, then apply
the rest of this reasoning silently and emit the result as the module's `CAMERA`
export. Don't narrate the geometry math beyond that unless asked to explain the
shot choice, and don't move objects in `buildScene` — that is the scene-blocking
skill's responsibility.
