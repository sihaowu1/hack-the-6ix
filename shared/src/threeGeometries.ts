/**
 * Known Three.js geometry constructor names the modelling pipeline may emit,
 * plus common LLM typos. Used to reject / rewrite bad `THREE.*Geometry` before
 * the viewport tries to construct them.
 */

/** Geometries the agent is allowed to use (and that exist on `THREE`). */
export const ALLOWED_GEOMETRIES = new Set([
  'BoxGeometry',
  'CapsuleGeometry',
  'CircleGeometry',
  'ConeGeometry',
  'CylinderGeometry',
  'DodecahedronGeometry',
  'EdgesGeometry',
  'ExtrudeGeometry',
  'IcosahedronGeometry',
  'LatheGeometry',
  'OctahedronGeometry',
  'PlaneGeometry',
  'PolyhedronGeometry',
  'RingGeometry',
  'ShapeGeometry',
  'SphereGeometry',
  'TetrahedronGeometry',
  'TorusGeometry',
  'TorusKnotGeometry',
  'TubeGeometry',
  'WireframeGeometry',
  'BufferGeometry',
]);

/**
 * Misspellings models occasionally invent. Keys are the bad name as written
 * after `THREE.`; values are the real constructor.
 */
const GEOMETRY_TYPOS: Record<string, string> = {
  CylinkerGeometry: 'CylinderGeometry',
  CylinerGeometry: 'CylinderGeometry',
  CylinderGeoemtry: 'CylinderGeometry',
  CylndricalGeometry: 'CylinderGeometry',
  BoxGeoemtry: 'BoxGeometry',
  SphereGeoemtry: 'SphereGeometry',
  ConeGeoemtry: 'ConeGeometry',
  TorusGeoemtry: 'TorusGeometry',
  CapsuleGeoemtry: 'CapsuleGeometry',
  PlaneGeoemtry: 'PlaneGeometry',
};

const GEOMETRY_REF = /\bTHREE\.([A-Za-z][A-Za-z0-9]*(?:Geometry|BufferGeometry))\b/g;

/** Rewrite known geometry typos in module source. Idempotent. */
export function rewriteGeometryTypos(code: string): string {
  return code.replace(GEOMETRY_REF, (match, name: string) => {
    const fixed = GEOMETRY_TYPOS[name];
    return fixed ? `THREE.${fixed}` : match;
  });
}

/**
 * Names referenced as `THREE.*Geometry` that are not real constructors.
 * Call after `rewriteGeometryTypos` so known typos are already fixed.
 */
export function findUnknownGeometries(code: string): string[] {
  const unknown = new Set<string>();
  for (const match of code.matchAll(GEOMETRY_REF)) {
    const name = match[1];
    if (!name || ALLOWED_GEOMETRIES.has(name)) continue;
    unknown.add(name);
  }
  return [...unknown];
}

/** Normalize a spec primitive typo to the real constructor name. */
export function normalizePrimitive(primitive: string): string {
  return GEOMETRY_TYPOS[primitive] ?? primitive;
}

/** Whether a (possibly misspelled) primitive resolves to a real geometry. */
export function isAllowedPrimitive(primitive: string): boolean {
  return ALLOWED_GEOMETRIES.has(normalizePrimitive(primitive));
}