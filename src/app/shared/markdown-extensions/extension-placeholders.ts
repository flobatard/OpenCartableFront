import { MarkdownExtensionDef } from './markdown-extension.model';

/**
 * Passe placeholder des extensions markdown — SYNCHRONE, pure, patron de
 * `renderCourseDiagrams` (core/markdown) : marked rend un fence ```geogebra en
 * `<pre><code class="language-geogebra">` (repli gracieux : la source reste
 * lisible tant que rien n'est monté) ; cette passe remplace chaque bloc d'un
 * langage ENREGISTRÉ par un hôte `<div data-oc-extension>` sur lequel
 * `markdown-view` montera le composant. Un langage non enregistré n'est jamais
 * ciblé : son bloc de code reste intact.
 *
 * Pas de re-sanitisation ici : l'entrée est déjà passée par DOMPurify
 * (`renderCourseMarkdown`, unique point de sanitisation) et la passe ne crée
 * des nœuds que par `createElement`/`setAttribute` (valeurs issues du code,
 * jamais du contenu) et `textContent` (source ré-échappée à la sérialisation).
 * Les attributs `data-*` posés ici survivent aux re-sanitize des passes
 * suivantes (mermaid, ressources) — invariant déjà éprouvé par
 * `data-oc-resource-id`.
 *
 * Module pur sans Angular : importable par `core/print` (constantes
 * d'attribut) sans dépendre de la couche composants.
 */

/** Attribut portant le langage de l'extension (hôte du composant monté). */
export const EXTENSION_ATTR = 'data-oc-extension';

/**
 * Attribut `true|false` posé depuis la def : l'export PDF sait substituer un
 * contenu interactif même si le composant n'est pas encore monté (import en vol).
 */
export const EXTENSION_PRINTABLE_ATTR = 'data-oc-printable';

/** Champs de la def utilisés par la passe (découplée du reste du contrat). */
type PlaceholderDef = Pick<MarkdownExtensionDef, 'language' | 'isPrintable'>;

/** Garde d'entrée bon marché, patron `hasCourseDiagrams`. */
export function hasMarkdownExtensions(
  html: string,
  defs: readonly Pick<MarkdownExtensionDef, 'language'>[],
): boolean {
  return defs.some((def) => html.includes(`language-${def.language}`));
}

/**
 * Remplace chaque `pre > code.language-<lang>` enregistré par
 * `<div class="course-extension" data-oc-extension="<lang>"
 * data-oc-printable="…">` dont le textContent est la source du fence.
 * Sans DOMParser (SSR), retourne le HTML inchangé.
 */
export function applyExtensionPlaceholders(
  html: string,
  defs: readonly PlaceholderDef[],
): string {
  if (typeof DOMParser === 'undefined') {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let changed = false;
  for (const def of defs) {
    for (const code of doc.querySelectorAll(`pre > code.language-${def.language}`)) {
      const pre = code.parentElement;
      if (pre === null) {
        continue;
      }
      const host = doc.createElement('div');
      // `--pending` (typo mono du repli source) est retiré au montage.
      host.className = 'course-extension course-extension--pending';
      host.setAttribute(EXTENSION_ATTR, def.language);
      host.setAttribute(EXTENSION_PRINTABLE_ATTR, def.isPrintable ? 'true' : 'false');
      host.textContent = code.textContent ?? '';
      pre.replaceWith(host);
      changed = true;
    }
  }
  return changed ? doc.body.innerHTML : html;
}
