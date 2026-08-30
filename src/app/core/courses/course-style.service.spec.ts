import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import {
  clampCourseStyle,
  COURSE_STYLE_DEFAULTS,
  courseStyleVars,
  CourseStyleService,
} from './course-style.service';

describe('clampCourseStyle', () => {
  it('returns the defaults for an empty or null input', () => {
    expect(clampCourseStyle(null)).toEqual(COURSE_STYLE_DEFAULTS);
    expect(clampCourseStyle(undefined)).toEqual(COURSE_STYLE_DEFAULTS);
    expect(clampCourseStyle({})).toEqual(COURSE_STYLE_DEFAULTS);
  });

  it('clamps every numeric setting into its range', () => {
    const s = clampCourseStyle({
      fontSizePx: 999,
      lineHeight: 0.1,
      widthCh: 5,
      headingScale: 9,
      paragraphGapEm: 99,
    });
    expect(s.fontSizePx).toBe(22);
    expect(s.lineHeight).toBe(1.4);
    expect(s.widthCh).toBe(54);
    expect(s.headingScale).toBe(1.3);
    expect(s.paragraphGapEm).toBe(2.4);
  });

  it('falls back to the default for a non-finite value', () => {
    const s = clampCourseStyle({
      fontSizePx: Number.NaN,
      lineHeight: undefined as unknown as number,
    });
    expect(s.fontSizePx).toBe(COURSE_STYLE_DEFAULTS.fontSizePx);
    expect(s.lineHeight).toBe(COURSE_STYLE_DEFAULTS.lineHeight);
  });

  it('accepts only sans/serif for the font (default sans)', () => {
    expect(clampCourseStyle({ font: 'serif' }).font).toBe('serif');
    expect(clampCourseStyle({ font: 'comic' as unknown as 'sans' }).font).toBe('sans');
  });
});

describe('courseStyleVars', () => {
  it('maps the settings to custom properties (screen+paper factors)', () => {
    const vars = courseStyleVars({
      fontSizePx: 20,
      headingScale: 1.1,
      lineHeight: 1.5,
      widthCh: 72,
      paragraphGapEm: 1.5,
      font: 'serif',
    });
    expect(vars['--course-font-scale']).toBe('1.25'); // 20 / 16
    expect(vars['--course-heading-scale']).toBe('1.1');
    expect(vars['--course-line-scale']).toBe(String(1.5 / 1.7));
    expect(vars['--course-para-scale']).toBe('1'); // 1.5 / 1.5
    expect(vars['--course-width']).toBe('72ch');
    expect(vars['--course-font']).toBe('var(--font-serif)');
  });

  it('yields neutral factors (1) and the sans-serif font at the defaults', () => {
    const vars = courseStyleVars(COURSE_STYLE_DEFAULTS);
    expect(vars['--course-font-scale']).toBe('1');
    expect(vars['--course-line-scale']).toBe('1');
    expect(vars['--course-para-scale']).toBe('1');
    expect(vars['--course-font']).toBe('var(--font-sans)');
  });
});

describe('CourseStyleService', () => {
  let service: CourseStyleService;

  beforeEach(() => {
    service = TestBed.inject(CourseStyleService);
  });

  it('starts on the default settings', () => {
    expect(service.settings()).toEqual(COURSE_STYLE_DEFAULTS);
    expect(service.styleVars()['--course-font-scale']).toBe('1');
  });

  it('update() applies a clamped patch, reflected by styleVars()', () => {
    service.update({ fontSizePx: 20 });
    expect(service.settings().fontSizePx).toBe(20);
    expect(service.styleVars()['--course-font-scale']).toBe('1.25');

    service.update({ fontSizePx: 999 });
    expect(service.settings().fontSizePx).toBe(22);
  });

  it('reset() restores the defaults', () => {
    service.update({ fontSizePx: 20, font: 'serif' });
    service.reset();
    expect(service.settings()).toEqual(COURSE_STYLE_DEFAULTS);
  });

  it('load() applies the stored course settings (preview_settings)', () => {
    service.load('course-1', { fontSizePx: 20, font: 'serif' });
    expect(service.settings().fontSizePx).toBe(20);
    expect(service.settings().font).toBe('serif');
    // Les autres champs retombent sur les défauts.
    expect(service.settings().lineHeight).toBe(COURSE_STYLE_DEFAULTS.lineHeight);
  });

  it('load() treats an empty object as never customized (defaults)', () => {
    service.load('course-1', {});
    expect(service.settings()).toEqual(COURSE_STYLE_DEFAULTS);
  });

  it('load() is idempotent on the same course, resets on another', () => {
    service.load('course-1');
    service.update({ fontSizePx: 20 });

    service.load('course-1'); // même cours → garde l’état courant
    expect(service.settings().fontSizePx).toBe(20);

    service.load('course-2'); // autre cours → réinitialise
    expect(service.settings()).toEqual(COURSE_STYLE_DEFAULTS);
  });
});

describe('CourseStyleService — persistence', () => {
  let service: CourseStyleService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CourseStyleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists the full object (6 fields) via PUT …/preview after the debounce', () => {
    const url = `${environment.apiUrl}/v1/courses/course-1/preview`;
    service.load('course-1');
    service.update({ fontSizePx: 20 });

    // Rien avant le débounce.
    httpMock.expectNone(url);
    vi.advanceTimersByTime(600);

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      fontSizePx: 20,
      headingScale: 1,
      lineHeight: 1.7,
      widthCh: 68,
      paragraphGapEm: 1.5,
      font: 'sans',
    });
    req.flush(req.request.body);
    httpMock.verify();
  });

  it('does not persist outside a course context (no course loaded)', () => {
    service.update({ fontSizePx: 20 });
    vi.advanceTimersByTime(600);
    // Aucune requête émise (courseId null).
    httpMock.verify();
  });
});
