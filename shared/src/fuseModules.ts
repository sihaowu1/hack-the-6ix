/**
 * Deterministic fuse: combine multiple scene modules into one self-contained
 * module (no AI). Children are placed on a shared ground plane with a gap;
 * part keys and PARAMS are namespaced by a short slug of each source name.
 */

export interface FuseModuleInput {
  name: string;
  code: string;
}

/** Stable short slug for namespacing (e.g. "Red Robot" → "red_robot"). */
export function fuseSlug(name: string, index: number): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return base || `model_${index + 1}`;
}

function extractBalancedObject(code: string, exportName: string): string | null {
  const re = new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*\\{`);
  const match = re.exec(code);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length - 1;
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  return null;
}

function escapeTemplateLiteral(source: string): string {
  return source.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function serializeParamValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '0';
}

/**
 * Build one scene module that embeds and co-places the given children.
 * Returns validated-shaped source (PARAMS + buildScene + updateScene).
 */
export function fuseSceneModules(modules: FuseModuleInput[]): string {
  if (modules.length < 2) {
    throw new Error('fuseSceneModules requires at least two modules');
  }

  const entries = modules.map((m, i) => {
    const slug = fuseSlug(m.name, i);
    const paramsLit = extractBalancedObject(m.code, 'PARAMS') ?? '{}';
    let params: Record<string, unknown> = {};
    try {
      params = new Function(`return (${paramsLit})`)() as Record<string, unknown>;
    } catch {
      params = {};
    }
    return { slug, name: m.name, code: m.code, params };
  });

  // Ensure unique slugs.
  const seen = new Map<string, number>();
  for (const entry of entries) {
    const count = seen.get(entry.slug) ?? 0;
    seen.set(entry.slug, count + 1);
    if (count > 0) entry.slug = `${entry.slug}_${count + 1}`;
  }

  const paramLines: string[] = [
    '  /**',
    '   * @tunable',
    '   * @min 0.2 @max 6 @step 0.1',
    '   * @label Gap between models',
    '   */',
    '  mergeGap: 1,',
  ];

  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry.params)) {
      const pref = `${entry.slug}_${key}`;
      if (typeof value === 'boolean') {
        paramLines.push(`  /** @tunable @label ${entry.slug} ${key} */`);
        paramLines.push(`  ${pref}: ${serializeParamValue(value)},`);
      } else if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) {
        paramLines.push(`  /** @tunable @label ${entry.slug} ${key} */`);
        paramLines.push(`  ${pref}: ${serializeParamValue(value)},`);
      } else if (typeof value === 'number') {
        paramLines.push(`  /** @tunable @min -10 @max 10 @step 0.05 @label ${entry.slug} ${key} */`);
        paramLines.push(`  ${pref}: ${serializeParamValue(value)},`);
      } else {
        paramLines.push(`  ${pref}: ${serializeParamValue(value)},`);
      }
    }
  }

  const sourceBlocks = entries
    .map(
      (e) =>
        `  { slug: ${JSON.stringify(e.slug)}, name: ${JSON.stringify(e.name)}, code: \`${escapeTemplateLiteral(e.code)}\` },`,
    )
    .join('\n');

  return `// Deterministic merge — ${entries.map((e) => e.name).join(' + ')}
// Children are embedded and placed on one ground plane. Animate this module like any other.

export const PARAMS = {
${paramLines.join('\n')}
};

export const CAMERA = {
  position: [0, 2.6, ${Math.max(7, 4 + entries.length * 2).toFixed(1)}],
  lookAt: [0, 0.8, 0],
  fov: 50,
};

const __CHILDREN = [
${sourceBlocks}
];

function __loadChild(source, THREE) {
  const rewritten = String(source)
    .replace(/export\\s+const\\s+/g, 'const ')
    .replace(/export\\s+function\\s+/g, 'function ')
    .replace(/export\\s+\\{[^}]*\\};?/g, '');
  const runner = new Function(
    'THREE',
    rewritten +
      '\\n; return {' +
      ' PARAMS: typeof PARAMS !== "undefined" ? PARAMS : {},' +
      ' CAMERA: typeof CAMERA !== "undefined" ? CAMERA : null,' +
      ' buildScene: typeof buildScene === "function" ? buildScene : null,' +
      ' updateScene: typeof updateScene === "function" ? updateScene : null' +
      ' };',
  );
  return runner(THREE);
}

function __childParams(slug, params) {
  const out = {};
  const prefix = slug + '_';
  for (const key of Object.keys(params)) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = params[key];
  }
  return out;
}

export function buildScene({ THREE, scene, params }) {
  const objects = {};
  const gap = typeof params.mergeGap === 'number' ? params.mergeGap : 1;
  const loaded = __CHILDREN.map((child) => {
    const mod = __loadChild(child.code, THREE);
    return { child, mod };
  });

  const widths = [];
  const groups = [];
  for (let i = 0; i < loaded.length; i++) {
    const { child, mod } = loaded[i];
    const group = new THREE.Group();
    group.name = 'merge:' + child.slug;
    const bucket = [];
    const proxyScene = {
      add: (...args) => {
        for (const obj of args) bucket.push(obj);
        return proxyScene;
      },
      remove: () => proxyScene,
      // Start with a Color so child buildScene may call .set safely.
      background: new THREE.Color(0x0b0d12),
    };
    const childParams = { ...mod.PARAMS, ...__childParams(child.slug, params) };
    const map = mod.buildScene
      ? mod.buildScene({ THREE, scene: proxyScene, params: childParams })
      : {};
    for (const obj of bucket) group.add(obj);
    if (proxyScene.background != null && i === 0) scene.background = proxyScene.background;

    group.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(group);
    const width = Math.max(box.max.x - box.min.x, 0.01);
    const centerX = (box.min.x + box.max.x) / 2;
    const minY = Number.isFinite(box.min.y) ? box.min.y : 0;
    widths.push({ width, centerX, minY });
    groups.push({ group, map, slug: child.slug, childParams, mod });
    scene.add(group);
  }

  let cursor = 0;
  const xOffsets = [];
  for (const w of widths) {
    xOffsets.push(cursor + w.width / 2 - w.centerX);
    cursor += w.width + gap;
  }
  const totalSpan = cursor - gap;
  const shift = -totalSpan / 2;
  for (let i = 0; i < groups.length; i++) {
    groups[i].group.position.x = xOffsets[i] + shift;
    groups[i].group.position.y = -widths[i].minY;
    objects[groups[i].slug + '_root'] = groups[i].group;
    const map = groups[i].map && typeof groups[i].map === 'object' ? groups[i].map : {};
    for (const [key, value] of Object.entries(map)) {
      objects[groups[i].slug + '_' + key] = value;
    }
  }

  objects.__merge = groups;
  return objects;
}

export function updateScene({ THREE, scene, objects, params, time }) {
  const groups = objects && objects.__merge;
  if (!Array.isArray(groups)) return;
  if (!scene.background || typeof scene.background.set !== 'function') {
    scene.background = new THREE.Color(0x0b0d12);
  }
  for (const entry of groups) {
    if (!entry || !entry.mod || typeof entry.mod.updateScene !== 'function') continue;
    const childParams = { ...entry.mod.PARAMS, ...__childParams(entry.slug, params) };
    entry.mod.updateScene({
      THREE,
      scene,
      objects: entry.map || {},
      params: childParams,
      time: time || 0,
    });
  }
}
`;
}
