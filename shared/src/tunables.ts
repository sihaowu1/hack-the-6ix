import type { TunableParam } from './types';

interface ParamsBlock {
  start: number;
  end: number;
  body: string;
}

/**
 * Locates the `export const PARAMS = { ... }` object in a scene module and
 * returns the character range of its body. Brace matching is sufficient here
 * because the contract restricts PARAMS values to literals.
 */
export function extractParamsBlock(code: string): ParamsBlock | null {
  const match = /export\s+const\s+PARAMS\s*=\s*\{/.exec(code);
  if (!match) return null;
  const open = match.index + match[0].length - 1;
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { start: open + 1, end: i, body: code.slice(open + 1, i) };
    }
  }
  return null;
}

// Matches: /** ...doc... */ name: value
const ENTRY_RE =
  /\/\*\*([\s\S]*?)\*\/\s*([A-Za-z_$][\w$]*)\s*:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[^,}\n]+)/g;

type ParsedValue =
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'color'; value: string };

/**
 * Extracts every `@tunable`-annotated PARAMS entry from scene-module code.
 * Numbers become sliders (@min/@max/@step), booleans become switches, and
 * hex-color strings become color inputs.
 */
export function parseTunables(code: string): TunableParam[] {
  const block = extractParamsBlock(code);
  if (!block) return [];
  const tunables: TunableParam[] = [];
  for (const m of block.body.matchAll(ENTRY_RE)) {
    const doc = m[1].replace(/^\s*\*\s?/gm, ' ');
    if (!/@tunable\b/.test(doc)) continue;
    const name = m[2];
    const parsed = parseValue(m[3].trim());
    if (!parsed) continue;
    const label = /@label\s+([^\n@]+)/.exec(doc)?.[1]?.trim() ?? titleCase(name);
    if (parsed.type === 'number') {
      const min = tagNumber(doc, 'min') ?? Math.min(0, parsed.value * 2);
      const max = tagNumber(doc, 'max') ?? Math.max(1, Math.abs(parsed.value) * 2);
      const step = tagNumber(doc, 'step') ?? (max - min) / 100;
      tunables.push({ name, label, type: 'number', value: parsed.value, min, max, step });
    } else if (parsed.type === 'boolean') {
      tunables.push({ name, label, type: 'boolean', value: parsed.value });
    } else {
      tunables.push({ name, label, type: 'color', value: parsed.value });
    }
  }
  return tunables;
}

/**
 * Rewrites the value of a single PARAMS entry in place, returning new code.
 * Used by the sliders/switches so every control edit is a code edit.
 */
export function patchParam(code: string, name: string, value: number | boolean | string): string {
  const block = extractParamsBlock(code);
  if (!block) return code;
  const serialized =
    typeof value === 'string' ? `'${value}'` : typeof value === 'number' ? formatNumber(value) : String(value);
  const entryRe = new RegExp(
    `(\\b${name}\\s*:\\s*)('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|[^,}\\n]+)`,
  );
  const patched = block.body.replace(entryRe, (_all, prefix: string) => `${prefix}${serialized}`);
  if (patched === block.body) return code;
  return code.slice(0, block.start) + patched + code.slice(block.end);
}

function parseValue(raw: string): ParsedValue | null {
  if (raw === 'true') return { type: 'boolean', value: true };
  if (raw === 'false') return { type: 'boolean', value: false };
  const hex = /^['"](#[0-9a-fA-F]{3,8})['"]$/.exec(raw);
  if (hex) return { type: 'color', value: hex[1] };
  const num = Number(raw);
  if (raw !== '' && Number.isFinite(num)) return { type: 'number', value: num };
  return null;
}

function tagNumber(doc: string, tag: string): number | undefined {
  const m = new RegExp(`@${tag}\\s+(-?[\\d.]+)`).exec(doc);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function titleCase(name: string): string {
  return name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function formatNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
}
