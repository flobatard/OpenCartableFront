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

function setup(defs: MarkdownExtensionDef[]): MarkdownExtensionRegistry {
  TestBed.configureTestingModule({
    providers: defs.map((def) => ({ provide: MARKDOWN_EXTENSIONS, useValue: def, multi: true })),
  });
  return TestBed.inject(MarkdownExtensionRegistry);
}

describe('MarkdownExtensionRegistry', () => {
  it('indexe les defs enregistrées et expose defs', () => {
    const def: MarkdownExtensionDef = {
      language: 'fake',
      isPrintable: true,
      loadComponent: () => Promise.resolve(FakeExtension as Type<MarkdownExtensionComponent>),
    };
    const registry = setup([def]);
    expect(registry.defs).toEqual([def]);
    expect(registry.get('fake')).toBe(def);
    expect(registry.get('inconnu')).toBeUndefined();
  });

  it('fonctionne sans aucune extension enregistrée', () => {
    const registry = setup([]);
    expect(registry.defs).toEqual([]);
    expect(registry.get('fake')).toBeUndefined();
  });

  it('mémoïse l’import : loadComponent appelé une seule fois pour deux load', async () => {
    const loadComponent = vi
      .fn()
      .mockResolvedValue(FakeExtension as Type<MarkdownExtensionComponent>);
    const registry = setup([{ language: 'fake', isPrintable: false, loadComponent }]);
    const [first, second] = await Promise.all([registry.load('fake'), registry.load('fake')]);
    expect(first).toBe(FakeExtension);
    expect(second).toBe(FakeExtension);
    expect(loadComponent).toHaveBeenCalledTimes(1);
  });

  it('rejette pour un langage inconnu', async () => {
    const registry = setup([]);
    await expect(registry.load('inconnu')).rejects.toThrow();
  });

  it('retire un import échoué du cache pour permettre la retentative', async () => {
    const loadComponent = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(FakeExtension as Type<MarkdownExtensionComponent>);
    const registry = setup([{ language: 'fake', isPrintable: false, loadComponent }]);
    await expect(registry.load('fake')).rejects.toThrow('offline');
    await expect(registry.load('fake')).resolves.toBe(FakeExtension);
    expect(loadComponent).toHaveBeenCalledTimes(2);
  });
});
