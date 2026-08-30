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
    it('prefixes the id with the oc-resource scheme', () => {
      expect(resourceRefHref('abc-123')).toBe(`${RESOURCE_REF_SCHEME}abc-123`);
      expect(resourceRefHref('abc-123')).toBe('oc-resource:abc-123');
    });
  });

  describe('parseResourceRef', () => {
    it('extracts the id from an oc-resource href', () => {
      expect(parseResourceRef('oc-resource:abc-123')).toBe('abc-123');
    });

    it('returns null for a foreign href', () => {
      expect(parseResourceRef('https://example.com/img.png')).toBeNull();
      expect(parseResourceRef('mailto:a@b.c')).toBeNull();
      expect(parseResourceRef('/relatif')).toBeNull();
    });

    it('returns null for an empty id', () => {
      expect(parseResourceRef('oc-resource:')).toBeNull();
      expect(parseResourceRef('oc-resource:   ')).toBeNull();
    });

    it('trims the whitespace around the id', () => {
      expect(parseResourceRef('oc-resource: abc ')).toBe('abc');
    });
  });

  describe('resourceKind', () => {
    it('maps image/audio/video onto themselves, everything else onto a link', () => {
      expect(resourceKind('image')).toBe('image');
      expect(resourceKind('audio')).toBe('audio');
      expect(resourceKind('video')).toBe('video');
      expect(resourceKind('document')).toBe('link');
    });
  });

  describe('buildResourceMarkdown', () => {
    it('produces an image syntax for an image', () => {
      expect(buildResourceMarkdown({ id: 'abc', original_name: 'Photo', type: 'image' })).toBe(
        '![Photo](oc-resource:abc)',
      );
    });

    it('produces a link for the other types', () => {
      expect(buildResourceMarkdown({ id: 'def', original_name: 'Cours.pdf', type: 'document' })).toBe(
        '[Cours.pdf](oc-resource:def)',
      );
      expect(buildResourceMarkdown({ id: 'ghi', original_name: 'Extrait.mp3', type: 'audio' })).toBe(
        '[Extrait.mp3](oc-resource:ghi)',
      );
    });

    it('escapes brackets and flattens newlines in the name', () => {
      expect(buildResourceMarkdown({ id: 'x', original_name: 'a [b] c', type: 'image' })).toBe(
        '![a \\[b\\] c](oc-resource:x)',
      );
      expect(buildResourceMarkdown({ id: 'x', original_name: 'ligne1\nligne2', type: 'document' })).toBe(
        '[ligne1 ligne2](oc-resource:x)',
      );
    });
  });
});
