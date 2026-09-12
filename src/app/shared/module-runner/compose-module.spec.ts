import { TestBed } from '@angular/core/testing';
import { composeModule, composeModuleAsync } from './compose-module';
import { MODULE_LIBRARY_FETCH, ModuleLibraryLoader } from './module-library-loader';

describe('composeModule', () => {
  let reads: string[];
  let loader: ModuleLibraryLoader;
  let fail: boolean;

  beforeEach(() => {
    reads = [];
    fail = false;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MODULE_LIBRARY_FETCH,
          useValue: (url: string) => {
            reads.push(url);
            return fail
              ? Promise.reject(new Error('offline'))
              : Promise.resolve(`/* ${url} */ window.lib = {};`);
          },
        },
      ],
    });
    loader = TestBed.inject(ModuleLibraryLoader);
  });

  it('composes synchronously and reads nothing without a pragma', () => {
    const composed = composeModule(loader, '<p>hi</p>', 'p { color: red }', 'go();');

    expect(composed).not.toBeInstanceOf(Promise);
    const { doc, libraryError } = composed as { doc: string; libraryError: boolean };
    expect(doc).toContain('<p>hi</p>');
    expect(doc).toContain('go();');
    expect(libraryError).toBe(false);
    expect(reads).toEqual([]);
  });

  it('inlines a declared library before the teacher’s JS', async () => {
    const { doc, libraryError } = await composeModuleAsync(
      loader,
      '',
      '',
      '// @oc-libs: chart\nnew Chart();',
    );

    expect(reads).toEqual(['/assets/module-libs/chart.js']);
    expect(libraryError).toBe(false);
    expect(doc.indexOf('window.lib = {};')).toBeLessThan(doc.indexOf('new Chart();'));
  });

  it('falls back to a module without its libraries when a read fails', async () => {
    fail = true;

    const { doc, libraryError } = await composeModuleAsync(loader, '', '', '// @oc-libs: p5\ndraw();');

    expect(libraryError).toBe(true);
    expect(doc).toContain('draw();');
    expect(doc).not.toContain('window.lib = {};');
  });

  it('ignores a library name outside the catalog', () => {
    const composed = composeModule(loader, '', '', '// @oc-libs: nope\ngo();');

    expect(composed).not.toBeInstanceOf(Promise);
    expect(reads).toEqual([]);
  });
});
