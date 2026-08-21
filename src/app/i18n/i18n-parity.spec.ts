import { describe, expect, it } from 'vitest';
import fr from './fr';
import en from './en';

/**
 * Garde la symétrie fr/en : le fallback runtime (missingHandler) masque toute
 * clé manquante en anglais, et depuis le découpage en fichiers par domaine un
 * fichier entier pourrait manquer d'un côté sans erreur de build.
 */
function leafKeys(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) {
    return [prefix];
  }
  return Object.entries(node).flatMap(([key, value]) =>
    leafKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe('parité des traductions fr/en', () => {
  const frKeys = new Set(leafKeys(fr));
  const enKeys = new Set(leafKeys(en));

  it('aucune clé fr ne manque en en', () => {
    expect([...frKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it('aucune clé en ne manque en fr', () => {
    expect([...enKeys].filter((k) => !frKeys.has(k))).toEqual([]);
  });
});
