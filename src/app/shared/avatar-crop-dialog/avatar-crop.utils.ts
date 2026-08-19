/**
 * Géométrie pure du recadrage d'avatar (modale `AvatarCropDialog`).
 *
 * Modèle : un cadre CARRÉ de côté `frame` (px CSS) ; l'image y est affichée à
 * l'échelle `scale` (px affichés / px naturels) et translatée de `offset`
 * (coin haut-gauche de l'image relativement au cadre, toujours ≤ 0 : l'image
 * couvre le cadre en permanence). Fonctions pures — c'est ici que vivent les
 * invariants, testés en jsdom sans canvas ni layout.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Échelle minimale pour que l'image couvre entièrement le cadre carré
 * (équivalent `object-fit: cover`). C'est le zoom 1 de la modale.
 */
export function coverScale(natural: Size, frame: number): number {
  return frame / Math.min(natural.width, natural.height);
}

/**
 * Borne l'offset pour que l'image couvre toujours le cadre : jamais de bord
 * visible (offset ∈ [frame − taille affichée, 0] sur chaque axe).
 */
export function clampOffset(offset: Point, scale: number, natural: Size, frame: number): Point {
  const minX = frame - natural.width * scale;
  const minY = frame - natural.height * scale;
  return {
    x: Math.min(0, Math.max(minX, offset.x)),
    y: Math.min(0, Math.max(minY, offset.y)),
  };
}

/** Offset centrant l'image dans le cadre (état initial au chargement). */
export function centeredOffset(scale: number, natural: Size, frame: number): Point {
  return {
    x: (frame - natural.width * scale) / 2,
    y: (frame - natural.height * scale) / 2,
  };
}

/**
 * Offset après changement d'échelle qui garde FIXE le point d'image au centre
 * du cadre (zoomer ne « saute » pas) ; à re-clamper par l'appelant.
 */
export function zoomedOffset(
  offset: Point,
  oldScale: number,
  newScale: number,
  frame: number,
): Point {
  const half = frame / 2;
  return {
    x: half - ((half - offset.x) / oldScale) * newScale,
    y: half - ((half - offset.y) / oldScale) * newScale,
  };
}

/**
 * Rectangle SOURCE (px naturels de l'image) visible dans le cadre — les
 * quatre premiers arguments de `drawImage` vers le canvas carré d'export.
 */
export function sourceRect(offset: Point, scale: number, frame: number): Rect {
  // `0 - x` plutôt que `-x` : évite le `-0` JavaScript quand l'offset est nul.
  return {
    x: (0 - offset.x) / scale,
    y: (0 - offset.y) / scale,
    width: frame / scale,
    height: frame / scale,
  };
}
