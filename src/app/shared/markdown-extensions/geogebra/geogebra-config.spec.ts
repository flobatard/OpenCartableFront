import { describe, expect, it } from 'vitest';
import { parseGeogebraConfig } from './geogebra-config';

describe('parseGeogebraConfig', () => {
  it('parses id, width and height', () => {
    expect(parseGeogebraConfig('id=RHYH3UQ8\nwidth=800\nheight=300')).toEqual({
      id: 'RHYH3UQ8',
      width: 800,
      height: 300,
    });
  });

  it('applies defaults without width/height', () => {
    expect(parseGeogebraConfig('id=abc123')).toEqual({ id: 'abc123', width: 600, height: 450 });
  });

  it('rejects a non-alphanumeric id (no URL ever built)', () => {
    expect(parseGeogebraConfig('id=../evil').id).toBeNull();
    expect(parseGeogebraConfig('id=abc"onload=x').id).toBeNull();
    expect(parseGeogebraConfig('id=https://evil.test/x').id).toBeNull();
    expect(parseGeogebraConfig('id=').id).toBeNull();
    expect(parseGeogebraConfig('width=600').id).toBeNull();
  });

  it('clamps width/height and falls back to the default when non-numeric', () => {
    expect(parseGeogebraConfig('id=a\nwidth=99999').width).toBe(1200);
    expect(parseGeogebraConfig('id=a\nwidth=10').width).toBe(200);
    expect(parseGeogebraConfig('id=a\nwidth=abc').width).toBe(600);
    expect(parseGeogebraConfig('id=a\nheight=5000').height).toBe(900);
    expect(parseGeogebraConfig('id=a\nheight=1').height).toBe(150);
  });
});
