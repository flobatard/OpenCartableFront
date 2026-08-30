import { describe, expect, it } from 'vitest';
import { configValue, configValues, parseExtensionConfig } from './extension-config';

describe('parseExtensionConfig', () => {
  it('parses key=value pairs line by line', () => {
    expect(parseExtensionConfig('id=abc123\nwidth=600')).toEqual([
      { key: 'id', value: 'abc123' },
      { key: 'width', value: '600' },
    ]);
  });

  it('unquotes values in double or single quotes', () => {
    expect(parseExtensionConfig('equation="x^2 + 2*x - 3"')).toEqual([
      { key: 'equation', value: 'x^2 + 2*x - 3' },
    ]);
    expect(parseExtensionConfig("label='aire du triangle'")).toEqual([
      { key: 'label', value: 'aire du triangle' },
    ]);
  });

  it('does not unquote an unmatched quote and preserves inner = signs', () => {
    expect(parseExtensionConfig('equation="x^2')).toEqual([{ key: 'equation', value: '"x^2' }]);
    expect(parseExtensionConfig('equation=y=x+1')).toEqual([{ key: 'equation', value: 'y=x+1' }]);
  });

  it('ignores empty lines, comments and lines without key=value', () => {
    const entries = parseExtensionConfig('\n# commentaire\nid=abc\n=orphelin\nsans-egal\n  \n');
    expect(entries).toEqual([{ key: 'id', value: 'abc' }]);
  });

  it('preserves duplicates in order', () => {
    const entries = parseExtensionConfig('point=1,1\npoint=2,2');
    expect(configValues(entries, 'point')).toEqual(['1,1', '2,2']);
  });

  it('tolerates spaces around the key and the value', () => {
    expect(parseExtensionConfig('  width = 600 ')).toEqual([{ key: 'width', value: '600' }]);
  });
});

describe('configValue / configValues', () => {
  const entries = parseExtensionConfig('a=1\na=2\nb=3');

  it('configValue returns the first value, or null when absent', () => {
    expect(configValue(entries, 'a')).toBe('1');
    expect(configValue(entries, 'absent')).toBeNull();
  });

  it('configValues returns all values in order, or []', () => {
    expect(configValues(entries, 'a')).toEqual(['1', '2']);
    expect(configValues(entries, 'absent')).toEqual([]);
  });
});
