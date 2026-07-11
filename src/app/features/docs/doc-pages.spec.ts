import { Type } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { MarkdownExtensionDef } from '../../shared/markdown-extensions/markdown-extension.model';
import { allDocPages, BUILTIN_DOC_PAGES, docPageBySlug } from './doc-pages';

const FAKE_COMPONENT = class {} as Type<unknown>;

function fakeDef(language: string): MarkdownExtensionDef {
  return {
    language,
    isPrintable: true,
    loadComponent: () => Promise.reject(new Error('unused')),
    doc: { loadComponent: () => Promise.resolve(FAKE_COMPONENT) },
  };
}

describe('allDocPages', () => {
  it('fusionne intégrés (katex, mermaid) puis extensions, dans l’ordre', () => {
    const pages = allDocPages([fakeDef('geogebra'), fakeDef('jsxgraph')]);
    expect(pages.map((p) => p.slug)).toEqual(['katex', 'mermaid', 'geogebra', 'jsxgraph']);
  });

  it('sans extension, ne liste que les intégrés', () => {
    expect(allDocPages([])).toEqual(BUILTIN_DOC_PAGES);
  });

  it('relaie le loadComponent de la doc de l’extension', async () => {
    const pages = allDocPages([fakeDef('geogebra')]);
    await expect(pages[2].loadComponent()).resolves.toBe(FAKE_COMPONENT);
  });
});

describe('docPageBySlug', () => {
  const pages = allDocPages([fakeDef('geogebra')]);

  it('trouve une page par slug', () => {
    expect(docPageBySlug(pages, 'mermaid')?.slug).toBe('mermaid');
    expect(docPageBySlug(pages, 'geogebra')?.slug).toBe('geogebra');
  });

  it('rend undefined pour un slug inconnu', () => {
    expect(docPageBySlug(pages, 'inconnu')).toBeUndefined();
  });
});
