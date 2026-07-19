import { slugify } from '../utils/fsx';
import { packModelFiles, type CodeExportFormat, type ProjectFile } from './codeExport';
import { reactPackageJson } from './exportTemplates';

/** Optional animated duplicate of a model's base module (full code copy). */
export interface GitHubAnimationInput {
  id: string;
  name: string;
  code: string;
  duration?: number;
  parts?: string[];
}

export interface GitHubModelInput {
  id: string;
  name: string;
  code: string;
  /** When set, a full copy of the animated module is written under `animations/<slug>/`. */
  animation?: GitHubAnimationInput;
}

/**
 * Multi-model GitHub layout (format wrappers per model/animation folder):
 *
 *   models/<slug>/scene.module.js
 *   models/<slug>/…format files…
 *   animations/<slug>/scene.module.js   (copy of the animated module, same slug)
 *   animations/<slug>/…format files…
 *   package.json                     (react only, repo root)
 *   README.md
 *
 * Slug = sanitized name + model id so paths stay unique and round-trip on pull.
 * Animations reuse the model slug so pull can reattach them. Empty `animations/`
 * keeps a `.gitkeep` when no model has an animation yet.
 */
export function buildGitHubProjectFiles(options: {
  models: GitHubModelInput[];
  title?: string;
  format?: CodeExportFormat;
}): ProjectFile[] {
  const models = options.models.filter((m) => m.code.trim());
  if (models.length === 0) {
    throw new Error('At least one model with code is required');
  }

  const title = options.title?.trim() || 'Zendai project';
  const format = options.format ?? 'standalone';
  const files: ProjectFile[] = [];
  let animationCount = 0;

  for (const model of models) {
    const slug = modelFolderSlug(model.name, model.id);
    const packed = packModelFiles({
      code: model.code,
      format,
      title: model.name,
    });
    for (const file of packed) {
      files.push({ path: `models/${slug}/${file.path}`, content: file.content });
    }

    const anim = model.animation;
    if (anim?.code.trim()) {
      animationCount += 1;
      const animTitle = anim.name.trim() || `${model.name} animation`;
      // Full copy of the animated module — not a live link to models/.
      const animPacked = packModelFiles({
        code: anim.code,
        format,
        title: animTitle,
      });
      for (const file of animPacked) {
        files.push({ path: `animations/${slug}/${file.path}`, content: file.content });
      }
    }
  }

  if (animationCount === 0) {
    files.push({ path: 'animations/.gitkeep', content: '' });
  }
  if (format === 'react') {
    files.push({ path: 'package.json', content: reactPackageJson() });
  }
  files.push({ path: 'README.md', content: githubProjectReadme(title, models, format) });
  return files;
}

export function modelFolderSlug(name: string, id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'model';
  return `${slugify(name)}-${safeId}`;
}

/** Inverse of `modelFolderSlug` for pull — id is the last `-` segment. */
export function parseModelFolder(folder: string): { id: string; name: string } {
  const idx = folder.lastIndexOf('-');
  if (idx <= 0) return { id: folder, name: folder.replace(/-/g, ' ') };
  return {
    id: folder.slice(idx + 1),
    name: folder.slice(0, idx).replace(/-/g, ' '),
  };
}

function formatLabel(format: CodeExportFormat): string {
  if (format === 'react') return 'React component';
  if (format === 'module') return 'ES module only';
  return 'Standalone HTML';
}

function githubProjectReadme(
  title: string,
  models: GitHubModelInput[],
  format: CodeExportFormat,
): string {
  const list = models
    .map((m) => {
      const slug = modelFolderSlug(m.name, m.id);
      const animNote =
        m.animation?.code.trim()
          ? ` (animation copy in \`animations/${slug}/\`)`
          : '';
      return `- \`models/${slug}/\` — ${m.name}${animNote}`;
    })
    .join('\n');

  const formatExtra =
    format === 'standalone'
      ? 'Each model/animation folder includes `index.html` + `viewer.js`. Serve a folder over HTTP (`npx serve models/<slug>`).'
      : format === 'react'
        ? 'Each model/animation folder includes `SceneCanvas.tsx`. Install peers from the root `package.json` (`three`, `react`, `react-dom`).'
        : 'Each model/animation folder is a raw `scene.module.js`. Hosts inject `THREE`; modules must not `import`/`require`/`fetch`.';

  return `# ${title}

Exported from Zendai — code-based 3D models, fully editable.

## Format: ${formatLabel(format)}

${formatExtra}

## Layout

- \`models/\` — one folder per model (\`scene.module.js\` plus format wrappers)
- \`animations/\` — full copies of each model's animated module (same slug as the model)

## Models

${list}

## Scene module contract

Each \`scene.module.js\` exports \`PARAMS\`, optional \`CAMERA\`, \`buildScene\`, and
\`updateScene\`. Animation copies also export \`ANIMATION\`.

## Tweak it

Edit any value in \`PARAMS\` and reload — the code is the project.
`;
}
