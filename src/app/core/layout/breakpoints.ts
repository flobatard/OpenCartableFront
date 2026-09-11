/**
 * Miroir TypeScript des mixins de `styles/_breakpoints.scss` (DESIGN_SYSTEM.md
 * §12), pour les rares comportements qu'une media query CSS ne peut porter
 * (état initial d'un `<details>`, panneau ouvert par défaut). Mêmes seuils :
 * les faire évoluer ensemble. Lire `matchMedia` en navigateur seulement.
 */

/** `bp.mobile` : téléphone. */
export const MOBILE_QUERY = '(width <= 640px)';

/** `bp.wide` : au-delà de l'empilement tablette. */
export const WIDE_QUERY = '(width > 900px)';
