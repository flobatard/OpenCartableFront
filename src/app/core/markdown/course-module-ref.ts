import { ModuleSummary } from '../modules/module.model';
import { escapeLinkText } from './course-resource-ref';

/**
 * Référence stable d'un module interactif de la bibliothèque dans le markdown
 * de cours — miroir du schéma `oc-resource:` (`course-resource-ref.ts`).
 *
 * Le markdown stocke `oc-module:<id>` (l'`id` de `ModuleSummary`) ; le rendu
 * transforme la référence en placeholder `data-oc-module-id` (override du
 * renderer `link` de `course-markdown.ts`), sur lequel `markdown-view` monte
 * dynamiquement un composant `ModuleEmbed` (iframe sandbox origine opaque).
 * Ce module est le point unique du schéma, partagé par l'insertion (picker de
 * l'éditeur) et le rendu.
 */

/** Préfixe de href identifiant une référence de module. */
export const MODULE_REF_SCHEME = 'oc-module:';

/** Attribut portant l'id sur le placeholder de rendu (survit à DOMPurify) —
 *  aussi posé par l'hôte de `ModuleEmbed`, clé de la note d'impression. */
export const MODULE_REF_ATTR = 'data-oc-module-id';

/** Href de référence stable pour l'`id` d'un module (`oc-module:<id>`). */
export function moduleRefHref(id: string): string {
  return `${MODULE_REF_SCHEME}${id}`;
}

/** Forme UUID (celle des ids de l'API) — insensible à la casse. */
const MODULE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vrai si `id` a la forme d'un id de module (UUID). Garde de sécurité : l'id
 * finit interpolé dans l'URL du `GET /modules/{id}` — un markdown piégé
 * (`oc-module:../../x`, ou un `data-oc-module-id` posé en HTML brut, que
 * DOMPurify laisse passer) forgerait sinon des requêtes API arbitraires,
 * Bearer attaché. Partagée par `parseModuleRef` et le montage des embeds
 * (`markdown-view`), les deux chemins d'entrée d'un id non issu de l'API.
 */
export function isModuleId(id: string): boolean {
  return MODULE_ID_PATTERN.test(id);
}

/** Id de module extrait d'un href `oc-module:<id>` valide (UUID), sinon `null`. */
export function parseModuleRef(href: string): string | null {
  if (!href.startsWith(MODULE_REF_SCHEME)) {
    return null;
  }
  const id = href.slice(MODULE_REF_SCHEME.length).trim();
  return isModuleId(id) ? id : null;
}

/** Snippet markdown insérant un module : `[titre](oc-module:<id>)`. */
export function buildModuleMarkdown(module: Pick<ModuleSummary, 'id' | 'titre'>): string {
  return `[${escapeLinkText(module.titre)}](${moduleRefHref(module.id)})`;
}
