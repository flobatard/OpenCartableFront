/**
 * Librairies préinstallées du bac à sable des modules — helpers PURS.
 *
 * Un module déclare les librairies dont il a besoin par un pragma en
 * commentaire dans son JS (`// @oc-libs: matter, chart`) ; le runtime les
 * INLINE dans le srcdoc avant le JS du prof (`composeModuleDocument`), sous
 * leur global habituel. La CSP du module n'est pas rouverte : l'iframe ne
 * charge rien, c'est le parent qui lit les fichiers `/assets/module-libs/`
 * (préparés par `scripts/prepare-module-libs.mjs`, mêmes noms de fichiers).
 *
 * Miroir back : `MODULE_LIBRARY_NAMES` et la puce « Bibliothèques » du prompt
 * `MODULE_RUNTIME` (`app/course_assistant/prompts.py`) — noms, globaux et
 * versions majeures évoluent ensemble.
 */

/** Base des fichiers servis (angular.json → `.module-libs/`). */
export const MODULE_LIBRARY_BASE = '/assets/module-libs/';

export interface ModuleLibrary {
  /** Nom déclaré dans le pragma `@oc-libs`. */
  readonly name: string;
  /** Global posé par la librairie (documentation, prompt du back). */
  readonly global: string;
  /** Fichier JS sous `MODULE_LIBRARY_BASE`. */
  readonly js: string;
  /** Feuille de style éventuelle sous `MODULE_LIBRARY_BASE`. */
  readonly css?: string;
}

/** Catalogue, dans l'ordre d'injection (déterministe). */
export const MODULE_LIBRARIES: readonly ModuleLibrary[] = [
  { name: 'matter', global: 'Matter', js: 'matter.js' },
  { name: 'chart', global: 'Chart', js: 'chart.js' },
  { name: 'p5', global: 'p5', js: 'p5.js' },
  { name: 'jsxgraph', global: 'JXG', js: 'jsxgraph.js', css: 'jsxgraph.css' },
  { name: 'd3', global: 'd3', js: 'd3.js' },
  { name: 'three', global: 'THREE', js: 'three.js' },
];

/** Librairies déclarées par un module, et noms inconnus du catalogue. */
export interface ModuleLibraryRequest {
  readonly libraries: readonly ModuleLibrary[];
  readonly unknown: readonly string[];
}

/** Ligne de pragma : `// @oc-libs: matter, chart` (plusieurs lignes s'additionnent). */
const PRAGMA = /^[ \t]*\/\/[ \t]*@oc-libs[ \t]*:(.*)$/gm;

/**
 * Lit les pragmas `@oc-libs` du JS d'un module. Noms insensibles à la casse,
 * séparés par virgules ou espaces ; librairies rendues dans l'ordre du
 * catalogue, noms inconnus relevés à part (jamais chargés).
 */
export function parseModuleLibraries(js: string): ModuleLibraryRequest {
  const names = new Set<string>();
  for (const match of js.matchAll(PRAGMA)) {
    for (const name of match[1].split(/[\s,]+/)) {
      if (name) {
        names.add(name.toLowerCase());
      }
    }
  }
  return {
    libraries: MODULE_LIBRARIES.filter((library) => names.has(library.name)),
    unknown: [...names].filter((name) => !MODULE_LIBRARIES.some((lib) => lib.name === name)),
  };
}
