import { describe, expect, it } from 'vitest';
import { configValue, configValues, parseExtensionConfig } from './extension-config';

describe('parseExtensionConfig', () => {
  it('parse les paires clé=valeur ligne par ligne', () => {
    expect(parseExtensionConfig('id=abc123\nwidth=600')).toEqual([
      { key: 'id', value: 'abc123' },
      { key: 'width', value: '600' },
    ]);
  });

  it('déquote les valeurs entre guillemets doubles ou simples', () => {
    expect(parseExtensionConfig('equation="x^2 + 2*x - 3"')).toEqual([
      { key: 'equation', value: 'x^2 + 2*x - 3' },
    ]);
    expect(parseExtensionConfig("label='aire du triangle'")).toEqual([
      { key: 'label', value: 'aire du triangle' },
    ]);
  });

  it('ne déquote pas un guillemet non apparié et préserve les = internes', () => {
    expect(parseExtensionConfig('equation="x^2')).toEqual([{ key: 'equation', value: '"x^2' }]);
    expect(parseExtensionConfig('equation=y=x+1')).toEqual([{ key: 'equation', value: 'y=x+1' }]);
  });

  it('ignore lignes vides, commentaires et lignes sans clé=valeur', () => {
    const entries = parseExtensionConfig('\n# commentaire\nid=abc\n=orphelin\nsans-egal\n  \n');
    expect(entries).toEqual([{ key: 'id', value: 'abc' }]);
  });

  it('préserve les doublons en ordre', () => {
    const entries = parseExtensionConfig('point=1,1\npoint=2,2');
    expect(configValues(entries, 'point')).toEqual(['1,1', '2,2']);
  });

  it('tolère les espaces autour de la clé et de la valeur', () => {
    expect(parseExtensionConfig('  width = 600 ')).toEqual([{ key: 'width', value: '600' }]);
  });
});

describe('configValue / configValues', () => {
  const entries = parseExtensionConfig('a=1\na=2\nb=3');

  it('configValue rend la première valeur, ou null si absente', () => {
    expect(configValue(entries, 'a')).toBe('1');
    expect(configValue(entries, 'absent')).toBeNull();
  });

  it('configValues rend toutes les valeurs en ordre, ou []', () => {
    expect(configValues(entries, 'a')).toEqual(['1', '2']);
    expect(configValues(entries, 'absent')).toEqual([]);
  });
});
