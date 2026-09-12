import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModuleDetail } from '../../core/modules/module.model';
import { resourceContentUrl } from '../../core/resources/resource.utils';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { MODULE_LIBRARY_FETCH } from '../module-runner/module-library-loader';
import { EXPORT_FETCH, ExportHtmlService } from './export-html.service';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const MODULE_ID = '33333333-3333-4333-8333-333333333333';
const RESOURCE_ID = '22222222-2222-4222-8222-222222222222';

const moduleDetail = (overrides: Partial<ModuleDetail> = {}): ModuleDetail =>
  ({
    id: MODULE_ID,
    title: 'Pendule',
    html: '<canvas id="c"></canvas>',
    css: 'canvas { width: 100% }',
    js: 'start();',
    ...overrides,
  }) as ModuleDetail;

describe('ExportHtmlService', () => {
  let downloaded: { blob: Blob; filename: string }[];
  let reads: string[];
  let fetchResult: (url: string) => Promise<Blob>;

  const setup = (platform: 'browser' | 'server' = 'browser'): ExportHtmlService => {
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: EXPORT_FETCH, useValue: (url: string) => fetchResult(url) },
        { provide: MODULE_LIBRARY_FETCH, useValue: async () => 'window.lib = {};' },
      ],
    });
    return TestBed.inject(ExportHtmlService);
  };

  /** Le fichier produit, tel qu'il serait enregistré. */
  const written = async (): Promise<string> => downloaded[0].blob.text();

  beforeEach(() => {
    downloaded = [];
    reads = [];
    fetchResult = async (url: string) => {
      reads.push(url);
      return new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    };
    URL.createObjectURL = vi.fn((blob: Blob) => {
      downloaded.push({ blob, filename: '' });
      return 'blob:mock';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  function source(html: string): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el;
  }

  it('does nothing during SSR', async () => {
    const service = setup('server');

    const report = await service.exportCourseContent(source('<p>x</p>'), {
      courseId: COURSE_ID,
      title: 'Cours',
    });

    expect(report).toBeNull();
    expect(downloaded).toEqual([]);
  });

  it('serialises a complete document and downloads it under a slugified name', async () => {
    const service = setup();

    const report = await service.exportCourseContent(source('<p>Théorème</p>'), {
      courseId: COURSE_ID,
      title: 'Les suites numériques',
    });

    const html = await written();
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Les suites numériques</title>');
    expect(html).toContain('<p>Théorème</p>');
    expect(report?.bytes).toBeGreaterThan(0);
  });

  it('embeds a module as a sandboxed srcdoc iframe, libraries inlined', async () => {
    const service = setup();

    const report = await service.exportCourseContent(
      source(`<app-module-embed data-oc-module-id="${MODULE_ID}"><p>chrome</p></app-module-embed>`),
      {
        courseId: COURSE_ID,
        title: 'Cours',
        getModule: async () => moduleDetail({ js: '// @oc-libs: chart\nstart();' }),
      },
    );

    const html = await written();
    expect(report?.embeddedModules).toBe(1);
    expect(html).toContain('data-oc-module-frame');
    expect(html).toContain('sandbox="allow-scripts allow-forms allow-modals"');
    // Le document du module vit dans l'attribut srcdoc, guillemets échappés…
    expect(html).toContain('srcdoc="<!doctype html>');
    expect(html).toContain('<canvas id=&quot;c&quot;>');
    // …librairie comprise, avant le JS du prof.
    expect(html.indexOf('window.lib = {};')).toBeLessThan(html.indexOf('start();'));
    expect(html).not.toContain('<p>chrome</p>');
  });

  it('falls back to a note when the module is unreachable or left out', async () => {
    const service = setup();

    const failing = await service.exportCourseContent(
      source(`<div data-oc-module-id="${MODULE_ID}"></div>`),
      {
        courseId: COURSE_ID,
        title: 'Cours',
        getModule: async () => {
          throw new Error('404');
        },
      },
    );
    const html = await written();

    expect(failing?.skippedModules).toBe(1);
    expect(html).toContain('oc-print__extension-note');
    expect(html).toContain(`/fr/courses/${COURSE_ID}`);
    expect(html).not.toContain('<iframe');
  });

  it('inlines images as data URIs', async () => {
    const service = setup();

    const report = await service.exportCourseContent(
      source(
        `<img data-oc-resource-id="${RESOURCE_ID}" src="https://s3.example/p.png?sig=1" alt="Schéma">`,
      ),
      { courseId: COURSE_ID, title: 'Cours' },
    );

    const html = await written();
    expect(reads).toEqual(['https://s3.example/p.png?sig=1']);
    expect(report?.inlinedImages).toBe(1);
    expect(html).toContain('src="data:image/png;base64,');
  });

  it('degrades an unreadable image to a note linking the stable URL', async () => {
    fetchResult = async () => {
      throw new Error('CORS');
    };
    const service = setup();

    const report = await service.exportCourseContent(
      source(`<img data-oc-resource-id="${RESOURCE_ID}" src="https://s3.example/p.png" alt="Schéma">`),
      { courseId: COURSE_ID, title: 'Cours' },
    );

    const html = await written();
    expect(report?.skippedImages).toBe(1);
    expect(html).not.toContain('<img');
    expect(html).toContain(resourceContentUrl('fr', COURSE_ID, RESOURCE_ID));
  });

  it('uses the resource URL builder given by the caller (student regime)', async () => {
    const service = setup();

    await service.exportCourseContent(
      source(`<a data-oc-resource-id="${RESOURCE_ID}" href="https://s3.example/x">Doc</a>`),
      {
        courseId: COURSE_ID,
        title: 'Cours',
        resourceUrl: (lang, courseId, resourceId) =>
          `https://oc.example/${lang}/shared/tok/resources/${resourceId}?c=${courseId}`,
      },
    );

    expect(await written()).toContain(`/fr/shared/tok/resources/${RESOURCE_ID}`);
  });
});
