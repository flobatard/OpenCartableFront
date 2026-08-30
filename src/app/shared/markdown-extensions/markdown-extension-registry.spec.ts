import { Component, input, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownExtensionRegistry } from './markdown-extension-registry';
import {
  MARKDOWN_EXTENSIONS,
  MarkdownExtensionComponent,
  MarkdownExtensionDef,
} from './markdown-extension.model';

@Component({ template: '' })
class FakeExtension implements MarkdownExtensionComponent {
  readonly source = input.required<string>();
}

/** Doc factice : le champ est requis par le contrat, sans intérêt ici. */
const FAKE_DOC = { loadComponent: () => Promise.resolve(FakeExtension as Type<unknown>) };

function setup(defs: MarkdownExtensionDef[]): MarkdownExtensionRegistry {
  TestBed.configureTestingModule({
    providers: defs.map((def) => ({ provide: MARKDOWN_EXTENSIONS, useValue: def, multi: true })),
  });
  return TestBed.inject(MarkdownExtensionRegistry);
}

describe('MarkdownExtensionRegistry', () => {
  it('indexes the registered defs and exposes defs', () => {
    const def: MarkdownExtensionDef = {
      language: 'fake',
      isPrintable: true,
      loadComponent: () => Promise.resolve(FakeExtension as Type<MarkdownExtensionComponent>),
      doc: FAKE_DOC,
    };
    const registry = setup([def]);
    expect(registry.defs).toEqual([def]);
    expect(registry.get('fake')).toBe(def);
    expect(registry.get('inconnu')).toBeUndefined();
  });

  it('works with no registered extension', () => {
    const registry = setup([]);
    expect(registry.defs).toEqual([]);
    expect(registry.get('fake')).toBeUndefined();
  });

  it('memoizes the import: loadComponent called once for two loads', async () => {
    const loadComponent = vi
      .fn()
      .mockResolvedValue(FakeExtension as Type<MarkdownExtensionComponent>);
    const registry = setup([{ language: 'fake', isPrintable: false, loadComponent, doc: FAKE_DOC }]);
    const [first, second] = await Promise.all([registry.load('fake'), registry.load('fake')]);
    expect(first).toBe(FakeExtension);
    expect(second).toBe(FakeExtension);
    expect(loadComponent).toHaveBeenCalledTimes(1);
  });

  it('rejects for an unknown language', async () => {
    const registry = setup([]);
    await expect(registry.load('inconnu')).rejects.toThrow();
  });

  it('removes a failed import from the cache to allow retrying', async () => {
    const loadComponent = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(FakeExtension as Type<MarkdownExtensionComponent>);
    const registry = setup([{ language: 'fake', isPrintable: false, loadComponent, doc: FAKE_DOC }]);
    await expect(registry.load('fake')).rejects.toThrow('offline');
    await expect(registry.load('fake')).resolves.toBe(FakeExtension);
    expect(loadComponent).toHaveBeenCalledTimes(2);
  });
});
