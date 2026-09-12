import { composeModuleDocument } from './module-document';
import { parseModuleLibraries } from './module-libraries';
import { ModuleLibraryLoader } from './module-library-loader';

/**
 * Composition d'un module AVEC ses librairies `@oc-libs` — le chemin commun à
 * tous ceux qui produisent le document d'un module :
 *
 * - `ModuleRunner` (preview live de l'éditeur, aperçu d'un bloc, embed
 *   `oc-module:` du markdown) le pose en `srcdoc` d'iframe ;
 * - l'export HTML autonome (`shared/export-html/`) l'embarque dans le fichier
 *   téléchargé — c'est ce qui rend les modules encore vivants hors ligne ;
 * - l'éditeur de module le télécharge tel quel (« Télécharger en HTML »).
 *
 * Un échec de lecture n'est jamais une erreur fatale : le module est composé
 * sans ses librairies et l'appelant en informe l'utilisateur.
 */

/** Document composé, et vrai si une librairie déclarée n'a pas pu être lue. */
export interface ComposedModule {
  readonly doc: string;
  readonly libraryError: boolean;
}

/**
 * Compose le document d'un module. **Synchrone** quand aucune librairie n'est
 * déclarée (le cas courant : rien à lire, la preview ne doit pas clignoter à
 * chaque frappe) ; une promesse sinon. Les appelants qui n'ont pas besoin de
 * ce chemin rapide passent par `composeModuleAsync`.
 */
export function composeModule(
  loader: ModuleLibraryLoader,
  html: string,
  css: string,
  js: string,
): ComposedModule | Promise<ComposedModule> {
  const { libraries } = parseModuleLibraries(js);
  if (libraries.length === 0) {
    return { doc: composeModuleDocument(html, css, js), libraryError: false };
  }
  return loader.load(libraries).then(
    (sources) => ({ doc: composeModuleDocument(html, css, js, sources), libraryError: false }),
    () => ({ doc: composeModuleDocument(html, css, js), libraryError: true }),
  );
}

/** `composeModule` toujours en promesse, pour les appelants non temps réel. */
export function composeModuleAsync(
  loader: ModuleLibraryLoader,
  html: string,
  css: string,
  js: string,
): Promise<ComposedModule> {
  return Promise.resolve(composeModule(loader, html, css, js));
}
