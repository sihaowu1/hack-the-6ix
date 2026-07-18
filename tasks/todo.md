# MotionForge — Build Plan

AI-powered, code-based 3D generation and video-editing system (hackathon build).

## Plan

- [ ] Repo scaffolding: workspaces, config, env template, gitignore
- [ ] `shared/` — types, tunable-parameter parser/patcher, scene-module validator, scene templates
- [ ] `skills/` — Claude Skills: `scene-generation` and `remotion-mp4`
- [ ] `server/` — Express API: config, utils, AI client, agents (scene / blender / render / orchestrator), Blender MCP client + tool bridge, Remotion renderer, code + MP4 export, routes
- [ ] `web/` — code editor (CodeMirror), element controls (sliders/switches/colors), WebGL viewport (Three.js), export panel, Blender panel
- [ ] `remotion/` — composition that renders the generated scene module to MP4
- [ ] `blender/` — Blender bridge add-on (TCP) + Python MCP server (stdio)
- [ ] Documentation: root README (full tree + module explanations) and per-folder READMEs with run instructions and expected output

## Review

(filled in after the build)
