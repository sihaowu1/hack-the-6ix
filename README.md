# zendai

AI-powered 3D generation: describe what you want in plain language, and the system produces fully editable Three.js code you can tweak, remix, and export — all running live in the browser.

[Live demo](https://zendai.vercel.app)  ·  [Devpost](https://devpost.com)

![Hackathon Winner Badge](https://img.shields.io/badge/Hack%20the%206ix-2026-blueviolet)
![License Badge](https://img.shields.io/badge/license-MIT-green)

### Landing Page
![Landing Page](images/landing.png)

### Screenshots

**Model generation:** type a prompt (or upload a reference image) and watch the AI build a component-based Three.js scene in real time — every part is named, tunable, and editable in the built-in code editor

**Image to 3D:** upload a photo of any object and the img2threejs pipeline decomposes it into primitives, extracts PBR materials, and reconstructs it as editable code — not a mesh blob

**Video generation:** animate your models with natural language, compose them on a timeline, and export as MP4 via Remotion

**Export:** push your project to GitHub, download scene code, or export geometry as GLB/OBJ/STL

---

This document is the developer and operator guide. For the original project story, see the Devpost submission.

## Architecture

Zendai is a prompt-to-3D pipeline. A text description (optionally with a reference image) flows through AI reasoning, code generation, validation, and live rendering before reaching the UI.

1. **Prompt.** The browser sends a natural-language prompt (and optional base64 reference image) to the Express server via `POST /api/generate`.
2. **Skill selection.** The server loads the appropriate AI skill as a system prompt — `threejs-modelling` for text-only prompts, or `img2threejs` for image-based reconstruction. Skills encode domain expertise (component decomposition, geometry patterns, PBR material rules).
3. **AI generation.** The prompt and skill are sent to Claude via OpenRouter. For image inputs, the model performs structured decomposition: identifying components, extracting colors and materials, establishing proportions, and choosing geometry strategies — all before writing code.
4. **Validation and retry.** The generated Three.js module is validated against the scene-module contract (exports `PARAMS`, `buildScene`, `updateScene`; no imports; no baked animation). If validation fails, the validator's errors are fed back for one corrective attempt.
5. **Live rendering.** The validated code is hot-loaded as an ES module in the browser, executed in a Three.js/WebGL sandbox with orbit controls, and rendered at 60fps. PARAMS drive tunable sliders in real time.
6. **Modification loop.** Users refine the model through follow-up prompts ("make the wheels bigger", "add metallic material"). Each modification preserves existing named parts and only changes what the instruction targets.
7. **Animation.** A separate animation skill adds one-shot timeline motion to any model, composable on a video timeline with multiple clips.
8. **Export.** Models can be pushed to a linked GitHub repo, exported as standalone JS/TS, rendered to MP4 via Remotion, or downloaded as GLB/OBJ/STL geometry.

## Tech stack

| Layer | Technologies |
|-------|-------------|
| Frontend framework | React 18, TypeScript, Vite |
| Styling and UI | Tailwind CSS v4, Lucide icons, Phosphor icons |
| 3D and visualization | Three.js, WebGL, OrbitControls |
| Code editor | CodeMirror 6 (JavaScript + Python modes, One Dark theme) |
| Client state | React hooks (`useSceneProject`), localStorage persistence |
| Auth | Auth0 (GitHub OAuth), optional — app runs fully anonymous without it |
| Backend framework | Express, Node.js, TypeScript (tsx) |
| AI model | Claude Sonnet 4.5 via OpenRouter (Anthropic SDK) |
| AI skill system | Markdown skill files loaded as system prompts, with domain-specific contracts |
| Video rendering | Remotion (server-side MP4 export) |
| Database | MongoDB Atlas (optional, marketplace features only) |
| GitHub integration | Octokit (create repos, commit models, pull remote state) |
| Geometry export | Three.js exporters (GLB, OBJ, STL) + Archiver for zipped bundles |
| Monorepo | npm workspaces (`shared`, `server`, `web`, `remotion`) |

## Prerequisites

- **Node.js** 18+ and **npm** (the repo uses npm workspaces)
- An **OpenRouter API key** for AI generation (without one, the app falls back to an offline template generator)

Optional accounts:
- **Auth0** for sign-in and GitHub export features
- **MongoDB Atlas** for the community marketplace
- **GitHub OAuth** (via Auth0) for push-to-repo

## Environment variables

Configuration lives in a single `.env` file at the repo root (copied from `.env.example`).

| Variable | Purpose | Required |
|----------|---------|----------|
| `OPENROUTER_API_KEY` | OpenRouter API key for Claude (AI generation) | No (offline fallback without it) |
| `VITE_AUTH0_DOMAIN` | Auth0 tenant domain | No |
| `VITE_AUTH0_CLIENT_ID` | Auth0 SPA client ID | No |
| `VITE_AUTH0_AUDIENCE` | Auth0 API audience identifier | No |
| `AUTH0_DOMAIN` | Auth0 domain (server-side JWT validation) | No |
| `AUTH0_AUDIENCE` | Auth0 audience (server-side JWT validation) | No |
| `AUTH0_MGMT_CLIENT_ID` | Auth0 Management API client ID (GitHub push) | No |
| `AUTH0_MGMT_CLIENT_SECRET` | Auth0 Management API secret (GitHub push) | No |
| `MONGODB_URI` | MongoDB Atlas connection string (marketplace) | No |
| `PORT` | Server port (default: 5174) | No |
| `ANTHROPIC_MODEL` | Model override (default: `anthropic/claude-sonnet-4.5`) | No |
| `REMOTION_GL` | Remotion GL backend (default: `angle`) | No |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# edit .env and add your OPENROUTER_API_KEY (minimum required for AI features)

# 3. Start the dev server (backend + frontend concurrently)
npm run dev
```

Health checks:
- Frontend: http://localhost:5173
- Backend: http://localhost:5174

The frontend (Vite) proxies `/api` requests to the backend automatically.

## AI skill system

Zendai uses a skill-based architecture for AI generation. Each skill is a Markdown file that encodes domain expertise as a system prompt:

| Skill | Role |
|-------|------|
| `threejs-modelling` | Generate and modify static, component-based Three.js models from text prompts |
| `img2threejs` | Reconstruct objects from reference images using structured decomposition and procedural primitives |
| `threejs-animation` | Add one-shot timeline animations to existing models |
| `remotion-mp4` | Plan and compose Remotion video sequences |
| `scene-generation` | Full scene generation including Blender Python output |
| `camera-composition` | Camera framing and aspect-ratio composition |

Skills enforce the scene-module contract: no imports (THREE is injected), exported PARAMS with tunable annotations, `buildScene`/`updateScene` lifecycle, and named component hierarchies.

## Scene module contract

Every generated model is a self-contained ES module:

```javascript
export const PARAMS = { /* @tunable annotated values */ };
export const CAMERA = { position: [x, y, z], lookAt: [x, y, z], fov: 45 };
export function buildScene({ THREE, scene, params }) { /* returns named parts map */ }
export function updateScene({ THREE, scene, objects, params, time }) { /* pure function of params */ }
```

This contract ensures models are:
- **Editable** — every visual constant is a tunable slider
- **Composable** — multiple models render side-by-side on a shared plane
- **Animatable** — the animation skill adds motion without breaking structure
- **Exportable** — code can be downloaded, committed, or rendered to video

## Repo layout

```
.
├── config/                  Default runtime configuration (JSON)
├── remotion/                Remotion composition for server-side MP4 rendering
│   └── src/                 React composition that evaluates scene modules
├── renders/                 Output directory for rendered MP4s
├── scripts/                 Dev utilities (port freeing, etc.)
├── server/                  Express backend
│   └── src/
│       ├── agents/          AI agents: scene, animation, render, blender, orchestrator
│       ├── ai/              Client setup, skill loader, code extraction
│       ├── auth/            Auth0 JWT middleware
│       ├── config/          Environment + JSON config merge
│       ├── db/              MongoDB connection (marketplace)
│       ├── export/          MP4 export job management
│       ├── remotion/        Remotion renderer integration
│       ├── routes/          Express routes: generate, animate, export, marketplace, github
│       └── utils/           Logging, file system helpers
├── shared/                  Shared types, validation, templates, tunables parser
│   └── src/
│       ├── types.ts         ReferenceImage, RenderSettings, GenerationResult, etc.
│       ├── validate.ts      Scene module contract validator
│       ├── sceneTemplate.ts Deterministic offline template builder
│       └── tunables.ts      PARAMS annotation parser (@min/@max/@step/@label)
├── skills/                  AI skill definitions (Markdown system prompts)
│   ├── img2threejs/         Image-to-3D reconstruction methodology
│   ├── threejs-modelling/   Text-to-3D component modelling
│   ├── threejs-animation/   One-shot animation generation
│   ├── remotion-mp4/        Video rendering planning
│   ├── scene-generation/    Full scene (Three.js + Blender)
│   └── camera-composition/  Camera framing skill
├── web/                     Vite + React frontend
│   └── src/
│       ├── api/             Typed API client
│       ├── auth/            Auth0 React integration
│       ├── components/      UI: ChatPanel, ModelsList, screens, timeline
│       ├── editor/          CodeMirror scene-code editor
│       ├── landing/         Marketing landing page
│       ├── state/           useSceneProject (all editor state)
│       └── viewport/        Three.js WebGL runtime, orbit controls, exporters
├── .env.example             Environment variable template
├── package.json             Root workspace config
└── README.md                This file
```

## Team

Derek Lau, Sihao Wu, Ethan Yang, Ian Yeh

## License

MIT. Built for Hack the 6ix 2026.
