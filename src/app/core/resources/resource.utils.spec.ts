import { formatBytes, resourceTypeFromMime } from './resource.utils';

describe('resourceTypeFromMime', () => {
  it('mappe les familles média évidentes', () => {
    expect(resourceTypeFromMime('image/png')).toBe('image');
    expect(resourceTypeFromMime('audio/mpeg')).toBe('audio');
    expect(resourceTypeFromMime('video/mp4')).toBe('video');
  });

  it('replie tout le reste sur document', () => {
    expect(resourceTypeFromMime('application/pdf')).toBe('document');
    expect(resourceTypeFromMime('application/zip')).toBe('document');
    expect(resourceTypeFromMime('text/plain')).toBe('document');
    expect(resourceTypeFromMime('application/octet-stream')).toBe('document');
    expect(resourceTypeFromMime('')).toBe('document');
  });
});

describe('formatBytes', () => {
  it('affiche les octets tels quels sous 1000', () => {
    expect(formatBytes(0)).toBe('0 o');
    expect(formatBytes(999)).toBe('999 o');
  });

  it('convertit en ko/Mo/Go avec une décimale et la virgule française', () => {
    expect(formatBytes(1000)).toBe('1,0 ko');
    expect(formatBytes(245_000)).toBe('245,0 ko');
    expect(formatBytes(1_800_000)).toBe('1,8 Mo');
    expect(formatBytes(52_000_000)).toBe('52,0 Mo');
    expect(formatBytes(3_400_000_000)).toBe('3,4 Go');
  });

  it('plafonne l’unité au Go (pas de To)', () => {
    expect(formatBytes(2_000_000_000_000)).toBe('2000,0 Go');
  });
});
