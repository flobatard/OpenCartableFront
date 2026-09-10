/**
 * Source d'un fence ```vegalite : une spécification Vega-Lite en JSON.
 *
 * Garde de contenu : AUCUNE clé `url`, à aucun niveau. Les données vivent dans
 * la spec (`data.values`) — un chargement par URL ferait partir une requête
 * du navigateur de chaque élève vers un tiers (et le loader de la vue le
 * bloquerait de toute façon, en silence). Refuser tôt donne un message clair.
 */

export type VegaliteSpec = Record<string, unknown>;

export type VegaliteParse =
  | { readonly ok: true; readonly spec: VegaliteSpec }
  | { readonly ok: false; readonly error: 'json' | 'notObject' | 'externalData'; readonly detail: string };

/** Largeur minimale imposée à un graphique sans `width`. */
export const VEGALITE_MIN_WIDTH = 240;

/** Parse et contrôle la spec ; jamais d'exception. */
export function parseVegaliteSpec(source: string): VegaliteParse {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (e) {
    return { ok: false, error: 'json', detail: e instanceof Error ? e.message : String(e) };
  }
  if (!isObject(value)) {
    return { ok: false, error: 'notObject', detail: '' };
  }
  const urlPath = findUrlKey(value, '');
  if (urlPath !== null) {
    return { ok: false, error: 'externalData', detail: urlPath };
  }
  return { ok: true, spec: value };
}

/** Chemin (`data.url`, `layer[1].data.url`…) de la première clé `url`, sinon `null`. */
export function findUrlKey(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findUrlKey(item, `${path}[${index}]`);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  if (!isObject(value)) {
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = path === '' ? key : `${path}.${key}`;
    if (key === 'url') {
      return childPath;
    }
    const found = findUrlKey(child, childPath);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/**
 * Graphique simple (`mark` ou `layer`) sans largeur : il prend celle du
 * conteneur, marges comprises. Les compositions (facet, concat, repeat)
 * gardent leur dimensionnement propre — `width` y serait invalide.
 */
export function withContainerWidth(spec: VegaliteSpec, containerWidth: number): VegaliteSpec {
  if (!('mark' in spec || 'layer' in spec) || 'width' in spec) {
    return spec;
  }
  return {
    ...spec,
    width: Math.max(VEGALITE_MIN_WIDTH, Math.round(containerWidth)),
    autosize: spec['autosize'] ?? { type: 'fit', contains: 'padding' },
  };
}

function isObject(value: unknown): value is VegaliteSpec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
