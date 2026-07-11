import { InjectionToken, InputSignal, Type } from '@angular/core';

/**
 * Extensions markdown de cours : un « langage » de fence custom (```geogebra,
 * ```jsxgraph…) rendu par un composant Angular monté dynamiquement à la place
 * du bloc de code, à la manière des diagrammes mermaid.
 *
 * Chaque langage fournit une `MarkdownExtensionDef` enregistrée en
 * multi-provider (`MARKDOWN_EXTENSIONS`, cf. markdown-extensions.providers.ts) ;
 * `MarkdownExtensionRegistry` les indexe et `markdown-view` les monte.
 * Ajouter un langage = un dossier ici + une entrée dans les providers.
 */

/**
 * Contrat du composant d'extension : il reçoit la source brute du fence via
 * l'input `source` (= `input.required<string>()` côté implémentation) et parse
 * lui-même sa configuration (helpers purs, cf. extension-config.ts).
 */
export interface MarkdownExtensionComponent {
  readonly source: InputSignal<string>;
}

/**
 * Documentation d'un langage : le composant de sa page
 * `/:lang/markdown-language/docs/<language>` (prose + exemples rendus +
 * playgrounds, cf. features/docs). Un composant même minimal est exigé —
 * l'obligation « chaque langage a sa doc » est portée par le type. Le langage
 * fournit aussi ses clés i18n `docs.pages.<language>.{title,summary}`.
 */
export interface MarkdownExtensionDoc {
  /**
   * Import dynamique du composant de doc — jamais statique depuis la def
   * (il entrerait dans le bundle initial via app.config).
   */
  readonly loadComponent: () => Promise<Type<unknown>>;
}

/** Déclaration d'un langage d'extension. */
export interface MarkdownExtensionDef {
  /** Identifiant du fence (```geogebra) — minuscules alphanumériques. */
  readonly language: string;
  /**
   * `false` : contenu interactif non imprimable — l'export PDF le substitue
   * par une note « contenu interactif : voir la version en ligne »
   * (cf. `transformForPrint`). `true` : le rendu (ex. SVG) est cloné tel quel.
   */
  readonly isPrintable: boolean;
  /**
   * Import dynamique du composant de rendu — jamais d'import statique depuis
   * la def (le composant et ses libs resteraient dans le bundle initial via
   * app.config).
   */
  readonly loadComponent: () => Promise<Type<MarkdownExtensionComponent>>;
  /** Page de documentation du langage (requis, cf. MarkdownExtensionDoc). */
  readonly doc: MarkdownExtensionDoc;
}

/** Multi-provider : chaque langage s'enregistre par une entrée. */
export const MARKDOWN_EXTENSIONS = new InjectionToken<readonly MarkdownExtensionDef[]>(
  'MARKDOWN_EXTENSIONS',
);
