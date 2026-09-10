import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { VegaliteView } from './vegalite-view';

// jsdom ne fait pas tourner Vega : on vérifie le câblage (spec compilée,
// parse en AST, vue sans rendu, loader bloqué, interpréteur) et le SVG posé.
const compile = vi.fn((spec: unknown, _opt?: unknown) => ({ spec: { compiled: spec } }));
const parse = vi.fn((spec: unknown, _config?: unknown, _opt?: unknown) => ({ runtime: spec }));
const viewOptions = vi.fn();
const toSVG = vi.fn(() =>
  Promise.resolve('<svg class="marks"><script>alert(1)</script><rect width="10"></rect></svg>'),
);
const finalize = vi.fn();
const fakeLoader = { load: vi.fn(), sanitize: vi.fn() };

vi.mock('vega', () => ({
  None: 0,
  logger: () => ({ level: () => 0 }),
  loader: () => fakeLoader,
  parse,
  View: class {
    constructor(_runtime: unknown, options: unknown) {
      viewOptions(options);
    }
    toSVG = toSVG;
    finalize = finalize;
  },
}));
vi.mock('vega-lite', () => ({ compile }));
vi.mock('vega-interpreter', () => ({ expressionInterpreter: { name: 'interpreter' } }));

async function createView(source: string) {
  const fixture = TestBed.createComponent(VegaliteView);
  fixture.componentRef.setInput('source', source);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const BAR = '{"description": "Villes", "mark": "bar", "data": {"values": [{"a": 1}]}}';

describe('VegaliteView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
  });

  it('renders the spec to a sanitized static SVG', async () => {
    const el = await createView(BAR);
    const board = el.querySelector('.vegalite-view__board');
    expect(board?.querySelector('svg rect')).not.toBeNull();
    expect(board?.querySelector('script')).toBeNull();
    expect(board?.getAttribute('aria-label')).toBe('Villes');
    expect(board?.classList).not.toContain('vegalite-view__board--hidden');
    expect(finalize).toHaveBeenCalledOnce();
  });

  it('parses as AST with the interpreter, no renderer and a loader that refuses everything', async () => {
    await createView(BAR);
    expect(parse.mock.calls[0][2]).toEqual({ ast: true });
    expect(viewOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        renderer: 'none',
        loader: fakeLoader,
        expr: { name: 'interpreter' },
      }),
    );
    await expect(fakeLoader.load()).rejects.toThrow();
    await expect(fakeLoader.sanitize()).rejects.toThrow();
  });

  it('gives a single view the container width', async () => {
    await createView(BAR);
    expect(compile.mock.calls[0][0]).toMatchObject({ width: expect.any(Number) });
  });

  it('refuses external data before loading anything', async () => {
    const el = await createView('{"data": {"url": "https://tiers/x.csv"}, "mark": "bar"}');
    expect(compile).not.toHaveBeenCalled();
    expect(el.querySelector('.vegalite-view__error')?.textContent).toContain(
      'Données externes refusées (data.url)',
    );
    expect(el.querySelector('.vegalite-view__board')?.classList).toContain(
      'vegalite-view__board--hidden',
    );
  });

  it('reports invalid JSON and compilation errors', async () => {
    const json = await createView('{"mark": }');
    expect(json.querySelector('.vegalite-view__error')?.textContent).toContain(
      'Spécification JSON invalide',
    );
    compile.mockImplementationOnce(() => {
      throw new Error('Invalid mark type');
    });
    const spec = await createView('{"mark": "bogus"}');
    expect(spec.querySelector('.vegalite-view__error')?.textContent).toContain(
      'Graphique invalide : Invalid mark type',
    );
  });
});
