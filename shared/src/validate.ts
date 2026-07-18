/**
 * Static checks that generated code satisfies the scene-module contract.
 * Returns a list of human-readable errors (empty means valid). Used by the
 * server (after AI generation) and the web viewport (before hot-loading).
 */
export function validateSceneModule(code: string): string[] {
  const errors: string[] = [];
  if (!code.trim()) {
    return ['the module is empty'];
  }
  if (!/export\s+const\s+PARAMS\s*=\s*\{/.test(code)) {
    errors.push('missing `export const PARAMS = { ... }`');
  }
  if (!/export\s+function\s+buildScene\s*\(/.test(code)) {
    errors.push('missing `export function buildScene(...)`');
  }
  if (!/export\s+function\s+updateScene\s*\(/.test(code)) {
    errors.push('missing `export function updateScene(...)`');
  }
  if (/^\s*import\s/m.test(code)) {
    errors.push('the module must not contain import statements (THREE is provided by the host)');
  }
  if (/\brequire\s*\(/.test(code)) {
    errors.push('the module must not use require()');
  }
  return errors;
}
