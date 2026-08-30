import { environment } from '../../../environments/environment';
import {
  formatBytes,
  isPdfResource,
  resourceContentUrl,
  resourceTypeFromMime,
  resourceTypeLabelKey,
} from './resource.utils';

describe('resourceTypeFromMime', () => {
  it('maps the obvious media families', () => {
    expect(resourceTypeFromMime('image/png')).toBe('image');
    expect(resourceTypeFromMime('audio/mpeg')).toBe('audio');
    expect(resourceTypeFromMime('video/mp4')).toBe('video');
  });

  it('falls back to document for everything else', () => {
    expect(resourceTypeFromMime('application/pdf')).toBe('document');
    expect(resourceTypeFromMime('application/zip')).toBe('document');
    expect(resourceTypeFromMime('text/plain')).toBe('document');
    expect(resourceTypeFromMime('application/octet-stream')).toBe('document');
    expect(resourceTypeFromMime('')).toBe('document');
  });
});

describe('isPdfResource', () => {
  it('recognizes the exact application/pdf mime', () => {
    expect(isPdfResource({ mime: 'application/pdf' })).toBe(true);
  });

  it('rejects any other mime (strict equality)', () => {
    expect(isPdfResource({ mime: 'image/png' })).toBe(false);
    expect(isPdfResource({ mime: 'application/zip' })).toBe(false);
    expect(isPdfResource({ mime: '' })).toBe(false);
  });
});

describe('resourceTypeLabelKey', () => {
  it('gives PDF documents a dedicated key', () => {
    expect(resourceTypeLabelKey({ type: 'document', mime: 'application/pdf' })).toBe(
      'courses.resources.types.pdf',
    );
  });

  it('keeps the type key for the rest', () => {
    expect(resourceTypeLabelKey({ type: 'document', mime: 'application/zip' })).toBe(
      'courses.resources.types.document',
    );
    expect(resourceTypeLabelKey({ type: 'image', mime: 'image/png' })).toBe(
      'courses.resources.types.image',
    );
  });
});

describe('formatBytes', () => {
  it('shows bytes as-is under 1000', () => {
    expect(formatBytes(0)).toBe('0 o');
    expect(formatBytes(999)).toBe('999 o');
  });

  it('converts to ko/Mo/Go with one decimal and the French comma', () => {
    expect(formatBytes(1000)).toBe('1,0 ko');
    expect(formatBytes(245_000)).toBe('245,0 ko');
    expect(formatBytes(1_800_000)).toBe('1,8 Mo');
    expect(formatBytes(52_000_000)).toBe('52,0 Mo');
    expect(formatBytes(3_400_000_000)).toBe('3,4 Go');
  });

  it('caps the unit at Go (no To)', () => {
    expect(formatBytes(2_000_000_000_000)).toBe('2000,0 Go');
  });
});

describe('resourceContentUrl', () => {
  it('builds the stable, absolute front URL of the redirect route', () => {
    expect(resourceContentUrl('fr', 'course-1', 'resource-2')).toBe(
      `${environment.siteUrl}/fr/courses/course-1/resources/resource-2`,
    );
  });

  it('carries the requested language', () => {
    expect(resourceContentUrl('en', 'c', 'r')).toBe(`${environment.siteUrl}/en/courses/c/resources/r`);
  });
});
