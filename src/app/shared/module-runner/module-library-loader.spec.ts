import { TestBed } from '@angular/core/testing';
import { MODULE_LIBRARIES, ModuleLibrary } from './module-libraries';
import { MODULE_LIBRARY_FETCH, ModuleLibraryLoader } from './module-library-loader';

const library = (name: string): ModuleLibrary =>
  MODULE_LIBRARIES.find((entry) => entry.name === name)!;

describe('ModuleLibraryLoader', () => {
  let fetchText: ReturnType<typeof vi.fn<(url: string) => Promise<string>>>;
  let loader: ModuleLibraryLoader;

  beforeEach(() => {
    fetchText = vi.fn((url: string) => Promise.resolve(`/* ${url} */`));
    TestBed.configureTestingModule({
      providers: [{ provide: MODULE_LIBRARY_FETCH, useValue: fetchText }],
    });
    loader = TestBed.inject(ModuleLibraryLoader);
  });

  it('reads each library (and its stylesheet) from the module-libs assets', async () => {
    const sources = await loader.load([library('matter'), library('jsxgraph')]);

    expect(sources).toEqual([
      { name: 'matter', js: '/* /assets/module-libs/matter.js */', css: '' },
      {
        name: 'jsxgraph',
        js: '/* /assets/module-libs/jsxgraph.js */',
        css: '/* /assets/module-libs/jsxgraph.css */',
      },
    ]);
  });

  it('reads each file once per session', async () => {
    await loader.load([library('p5')]);
    await loader.load([library('p5'), library('d3')]);
    await Promise.all([loader.load([library('three')]), loader.load([library('three')])]);

    expect(fetchText.mock.calls.map(([url]) => url)).toEqual([
      '/assets/module-libs/p5.js',
      '/assets/module-libs/d3.js',
      '/assets/module-libs/three.js',
    ]);
  });

  it('drops a failed read from the cache so that the next load retries', async () => {
    fetchText.mockRejectedValueOnce(new Error('offline'));

    await expect(loader.load([library('chart')])).rejects.toThrow('offline');
    await expect(loader.load([library('chart')])).resolves.toHaveLength(1);
    expect(fetchText).toHaveBeenCalledTimes(2);
  });
});
