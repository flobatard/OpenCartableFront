import { Type } from '@angular/core';
import { MarkdownExtensionDef } from '../../shared/markdown-extensions/markdown-extension.model';

/**
 * Pages de documentation des « langages » du markdown de cours
 * (`/:lang/markdown-language/docs/:slug`). Deux origines fusionnées par
 * `allDocPages` : les langages INTÉGRÉS au pipeline (KaTeX, Mermaid — déclarés
 * ici, leurs slugs sont réservés) puis les extensions du registry, dont le
 * contrat (`MarkdownExtensionDef.doc`) impose le composant de doc. Chaque slug
 * porte ses clés i18n `docs.pages.<slug>.{title,summary}`.
 */
export interface DocPage {
  /** Slug d'URL — pour une extension, c'est son `language`. */
  readonly slug: string;
  /** Import dynamique du composant de la page (jamais statique — bundle). */
  readonly loadComponent: () => Promise<Type<unknown>>;
}

/** Langages intégrés, en tête de l'index dans cet ordre (KaTeX = page par défaut). */
export const BUILTIN_DOC_PAGES: readonly DocPage[] = [
  {
    slug: 'katex',
    loadComponent: () => import('./katex-doc/katex-doc').then((m) => m.KatexDoc),
  },
  {
    slug: 'mermaid',
    loadComponent: () => import('./mermaid-doc/mermaid-doc').then((m) => m.MermaidDoc),
  },
];

/** Intégrés d'abord, puis les extensions dans l'ordre d'enregistrement des providers. */
export function allDocPages(defs: readonly MarkdownExtensionDef[]): readonly DocPage[] {
  return [
    ...BUILTIN_DOC_PAGES,
    ...defs.map((def) => ({ slug: def.language, loadComponent: def.doc.loadComponent })),
  ];
}

/** Page d'un slug, ou `undefined` (slug inconnu → notice côté shell). */
export function docPageBySlug(
  pages: readonly DocPage[],
  slug: string,
): DocPage | undefined {
  return pages.find((page) => page.slug === slug);
}
