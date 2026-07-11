import { describe, expect, it } from 'vitest';
import { parseGeogebraConfig } from './geogebra-config';

describe('parseGeogebraConfig', () => {
  it('parse id, width et height', () => {
    expect(parseGeogebraConfig('id=RHYH3UQ8\nwidth=800\nheight=300')).toEqual({
      id: 'RHYH3UQ8',
      width: 800,
      height: 300,
    });
  });

  it('applique les défauts sans width/height', () => {
    expect(parseGeogebraConfig('id=abc123')).toEqual({ id: 'abc123', width: 600, height: 450 });
  });

  it('rejette un id non alphanumérique (jamais d’URL construite)', () => {
    expect(parseGeogebraConfig('id=../evil').id).toBeNull();
    expect(parseGeogebraConfig('id=abc"onload=x').id).toBeNull();
    expect(parseGeogebraConfig('id=https://evil.test/x').id).toBeNull();
    expect(parseGeogebraConfig('id=').id).toBeNull();
    expect(parseGeogebraConfig('width=600').id).toBeNull();
  });

  it('borne width/height et replie sur le défaut si non numérique', () => {
    expect(parseGeogebraConfig('id=a\nwidth=99999').width).toBe(1200);
    expect(parseGeogebraConfig('id=a\nwidth=10').width).toBe(200);
    expect(parseGeogebraConfig('id=a\nwidth=abc').width).toBe(600);
    expect(parseGeogebraConfig('id=a\nheight=5000').height).toBe(900);
    expect(parseGeogebraConfig('id=a\nheight=1').height).toBe(150);
  });
});
