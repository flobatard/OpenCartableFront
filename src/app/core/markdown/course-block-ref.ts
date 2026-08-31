/**
 * Référence stable d'un bloc du cours dans le markdown — miroir du schéma
 * `oc-module:` (`course-module-ref.ts`), au service des **citations de
 * l'assistant IA** : le modèle cite un bloc par `[titre](oc-block:<id>)`.
 *
 * Le rendu (override du renderer `link` de `course-markdown.ts`) émet une
 * ancre inerte `<a data-oc-block-id>` sans href ; c'est l'hôte qui décide de
 * la rendre cliquable (le panneau assistant navigue vers l'éditeur du bloc via
 * une délégation d'événements sur son fil de messages). Hors contexte
 * assistant, l'ancre reste un simple texte — aucun risque pour les autres
 * consommateurs de markdown-view.
 */

/** Préfixe de href identifiant une référence de bloc. */
export const BLOCK_REF_SCHEME = 'oc-block:';

/** Attribut portant l'id sur l'ancre rendue (survit à DOMPurify via `data-*`). */
export const BLOCK_REF_ATTR = 'data-oc-block-id';

/** Forme UUID (celle des ids de l'API) — insensible à la casse. */
const BLOCK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vrai si `id` a la forme d'un id de bloc (UUID). Garde de sécurité (même
 * rationale qu'`isModuleId`) : l'id finit interpolé dans une commande de
 * navigation `/courses/:id/blocks/:blockId` — un markdown généré par le
 * modèle ou un `data-oc-block-id` posé en HTML brut ne doit jamais y injecter
 * autre chose qu'un UUID. Partagée par `parseBlockRef` (rendu) et la
 * délégation de clic du chat (attribut relu depuis le DOM).
 */
export function isBlockId(id: string): boolean {
  return BLOCK_ID_PATTERN.test(id);
}

/** Id de bloc extrait d'un href `oc-block:<id>` valide (UUID), sinon `null`. */
export function parseBlockRef(href: string): string | null {
  if (!href.startsWith(BLOCK_REF_SCHEME)) {
    return null;
  }
  const id = href.slice(BLOCK_REF_SCHEME.length).trim();
  return isBlockId(id) ? id : null;
}
