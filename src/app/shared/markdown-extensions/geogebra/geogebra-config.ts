import { configValue, parseExtensionConfig } from '../extension-config';

/**
 * Configuration d'un fence ```geogebra :
 *
 *   id=RHYH3UQ8
 *   width=600
 *   height=450
 *
 * `id` est l'identifiant du matériel sur geogebra.org — STRICTEMENT
 * alphanumérique (jamais une URL) : c'est la garantie qu'aucune donnée auteur
 * ne peut injecter scheme/host/path dans l'URL d'embed construite par le
 * composant. Un id invalide donne `null` (notice, pas d'iframe).
 */

const GEOGEBRA_ID_RULE = /^[a-zA-Z0-9]+$/;

const WIDTH_DEFAULT = 600;
const WIDTH_MIN = 200;
const WIDTH_MAX = 1200;
const HEIGHT_DEFAULT = 450;
const HEIGHT_MIN = 150;
const HEIGHT_MAX = 900;

export interface GeogebraConfig {
  readonly id: string | null;
  readonly width: number;
  readonly height: number;
}

/** Parse la source du fence ; valeurs manquantes/invalides → défauts sûrs. */
export function parseGeogebraConfig(source: string): GeogebraConfig {
  const entries = parseExtensionConfig(source);
  const rawId = configValue(entries, 'id');
  return {
    id: rawId !== null && GEOGEBRA_ID_RULE.test(rawId) ? rawId : null,
    width: clampInt(configValue(entries, 'width'), WIDTH_DEFAULT, WIDTH_MIN, WIDTH_MAX),
    height: clampInt(configValue(entries, 'height'), HEIGHT_DEFAULT, HEIGHT_MIN, HEIGHT_MAX),
  };
}

/** Entier borné ; non numérique ou absent → repli. */
function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}
