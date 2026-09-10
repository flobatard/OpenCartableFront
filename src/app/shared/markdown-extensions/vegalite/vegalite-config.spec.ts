import { describe, expect, it } from 'vitest';
import { findUrlKey, parseVegaliteSpec, VEGALITE_MIN_WIDTH, withContainerWidth } from './vegalite-config';

describe('parseVegaliteSpec', () => {
  it('accepts an inline-data spec', () => {
    const result = parseVegaliteSpec('{"mark": "bar", "data": {"values": [{"a": 1}]}}');
    expect(result).toEqual({ ok: true, spec: { mark: 'bar', data: { values: [{ a: 1 }] } } });
  });

  it('reports invalid JSON with the parser message', () => {
    const result = parseVegaliteSpec('{"mark": "bar",}');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe('json');
    expect(result.ok === false && result.detail).not.toBe('');
  });

  it('refuses anything but an object', () => {
    expect(parseVegaliteSpec('[1, 2]')).toEqual({ ok: false, error: 'notObject', detail: '' });
    expect(parseVegaliteSpec('"bar"')).toEqual({ ok: false, error: 'notObject', detail: '' });
  });

  it('refuses external data wherever it hides', () => {
    expect(parseVegaliteSpec('{"data": {"url": "https://tiers/data.csv"}, "mark": "bar"}')).toEqual({
      ok: false,
      error: 'externalData',
      detail: 'data.url',
    });
    const layered = parseVegaliteSpec(
      '{"layer": [{"mark": "line"}, {"mark": "image", "encoding": {"url": {"field": "img"}}}]}',
    );
    expect(layered).toEqual({ ok: false, error: 'externalData', detail: 'layer[1].encoding.url' });
  });
});

describe('findUrlKey', () => {
  it('ignores url-like values that are not keys', () => {
    expect(findUrlKey({ title: 'url', description: 'https://exemple.fr' }, '')).toBeNull();
  });
});

describe('withContainerWidth', () => {
  it('gives a single view the container width, fitted with its padding', () => {
    expect(withContainerWidth({ mark: 'bar' }, 612.4)).toEqual({
      mark: 'bar',
      width: 612,
      autosize: { type: 'fit', contains: 'padding' },
    });
    expect(withContainerWidth({ layer: [] }, 10)).toMatchObject({ width: VEGALITE_MIN_WIDTH });
  });

  it('keeps an explicit width or autosize, and leaves compositions alone', () => {
    expect(withContainerWidth({ mark: 'bar', width: 300 }, 600)).toEqual({ mark: 'bar', width: 300 });
    expect(withContainerWidth({ mark: 'bar', autosize: 'pad' }, 600)).toMatchObject({ autosize: 'pad' });
    const facet = { facet: { field: 'x' }, spec: { mark: 'bar' } };
    expect(withContainerWidth(facet, 600)).toBe(facet);
  });
});
