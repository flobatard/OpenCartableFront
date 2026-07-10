import { describe, expect, it } from 'vitest';
import {
  buildResourceMarkdown,
  parseResourceRef,
  resourceKind,
  resourceRefHref,
  RESOURCE_REF_SCHEME,
} from './course-resource-ref';

describe('course-resource-ref', () => {
  describe('resourceRefHref', () => {
    it('préfixe l’id du schéma oc-resource', () => {
      expect(resourceRefHref('abc-123')).toBe(`${RESOURCE_REF_SCHEME}abc-123`);
      expect(resourceRefHref('abc-123')).toBe('oc-resource:abc-123');
    });
  });

  describe('parseResourceRef', () => {
    it('extrait l’id d’un href oc-resource', () => {
      expect(parseResourceRef('oc-resource:abc-123')).toBe('abc-123');
    });

    it('renvoie null pour un href étranger', () => {
      expect(parseResourceRef('https://example.com/img.png')).toBeNull();
      expect(parseResourceRef('mailto:a@b.c')).toBeNull();
      expect(parseResourceRef('/relatif')).toBeNull();
    });

    it('renvoie null pour un id vide', () => {
      expect(parseResourceRef('oc-resource:')).toBeNull();
      expect(parseResourceRef('oc-resource:   ')).toBeNull();
    });

    it('rogne les espaces autour de l’id', () => {
      expect(parseResourceRef('oc-resource: abc ')).toBe('abc');
    });
  });

  describe('resourceKind', () => {
    it('mappe image/audio/vidéo sur eux-mêmes, tout le reste sur un lien', () => {
      expect(resourceKind('image')).toBe('image');
      expect(resourceKind('audio')).toBe('audio');
      expect(resourceKind('video')).toBe('video');
      expect(resourceKind('document')).toBe('link');
    });
  });

  describe('buildResourceMarkdown', () => {
    it('produit une syntaxe image pour une image', () => {
      expect(buildResourceMarkdown({ id: 'abc', nom_original: 'Photo', type: 'image' })).toBe(
        '![Photo](oc-resource:abc)',
      );
    });

    it('produit un lien pour les autres types', () => {
      expect(buildResourceMarkdown({ id: 'def', nom_original: 'Cours.pdf', type: 'document' })).toBe(
        '[Cours.pdf](oc-resource:def)',
      );
      expect(buildResourceMarkdown({ id: 'ghi', nom_original: 'Extrait.mp3', type: 'audio' })).toBe(
        '[Extrait.mp3](oc-resource:ghi)',
      );
    });

    it('échappe les crochets et aplatit les retours ligne du nom', () => {
      expect(buildResourceMarkdown({ id: 'x', nom_original: 'a [b] c', type: 'image' })).toBe(
        '![a \\[b\\] c](oc-resource:x)',
      );
      expect(buildResourceMarkdown({ id: 'x', nom_original: 'ligne1\nligne2', type: 'document' })).toBe(
        '[ligne1 ligne2](oc-resource:x)',
      );
    });
  });
});
