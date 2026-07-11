import { configValues, parseExtensionConfig } from '../extension-config';

/**
 * Configuration d'un fence ```jsxgraph :
 *
 *   equation="x^2 + 2*x - 3"     # répétable, syntaxe JessieCode
 *   point="2,2"                  # répétable
 *   bbox="-5,5,5,-5"             # xmin,ymax,xmax,ymin (optionnel)
 *
 * Les entrées malformées (point sans deux nombres, bbox incomplète) sont
 * ignorées — jamais d'exception, la figure se trace avec ce qui est valide.
 */

const BBOX_DEFAULT: readonly [number, number, number, number] = [-5, 5, 5, -5];

export interface JsxgraphConfig {
  readonly equations: readonly string[];
  readonly points: readonly (readonly [number, number])[];
  readonly boundingBox: readonly [number, number, number, number];
}

/** Parse la source du fence en configuration sûre. */
export function parseJsxgraphConfig(source: string): JsxgraphConfig {
  const entries = parseExtensionConfig(source);
  return {
    equations: configValues(entries, 'equation')
      .map((eq) => eq.trim())
      .filter((eq) => eq !== ''),
    points: configValues(entries, 'point')
      .map(parsePoint)
      .filter((p): p is [number, number] => p !== null),
    boundingBox: parseBbox(configValues(entries, 'bbox')[0] ?? null),
  };
}

/** `"x,y"` → couple de nombres finis, sinon `null`. */
function parsePoint(raw: string): [number, number] | null {
  const parts = raw.split(',').map((p) => Number.parseFloat(p.trim()));
  return parts.length === 2 && parts.every(Number.isFinite) ? [parts[0], parts[1]] : null;
}

/** `"xmin,ymax,xmax,ymin"` → bounding box, sinon défaut. */
function parseBbox(raw: string | null): readonly [number, number, number, number] {
  if (raw === null) {
    return BBOX_DEFAULT;
  }
  const parts = raw.split(',').map((p) => Number.parseFloat(p.trim()));
  return parts.length === 4 && parts.every(Number.isFinite)
    ? [parts[0], parts[1], parts[2], parts[3]]
    : BBOX_DEFAULT;
}
