import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { SmilesView } from './smiles-view';

// jsdom ne dessine pas : un faux SmilesDrawer remplit le SVG comme le vrai
// (viewBox, <style> global, masque) et refuse les SMILES contenant « ! ».
const drawerOptions = vi.fn();
const draw = vi.fn((_tree: unknown, svg: SVGSVGElement, _theme?: string) => {
  svg.setAttribute('viewBox', '0 0 80 40');
  svg.innerHTML =
    '<style>.element { font: 11pt Arial; }</style>' +
    '<mask id="m-text-mask"></mask><g mask="url(#m-text-mask)"><line></line></g>' +
    '<text class="element">O</text>';
  return svg;
});
const parse = vi.fn(
  (smiles: string, ok: (tree: unknown) => void, fail: (e: Error) => void) => {
    if (smiles.includes('!')) {
      fail(new Error('invalide'));
    } else {
      ok({ smiles });
    }
  },
);

vi.mock('smiles-drawer', () => ({
  default: {
    parse,
    SvgDrawer: class {
      constructor(options: unknown) {
        drawerOptions(options);
      }
      draw = draw;
    },
  },
}));

async function createView(source: string) {
  const fixture = TestBed.createComponent(SmilesView);
  fixture.componentRef.setInput('source', source);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SmilesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
  });

  it('draws each molecule as a skeletal formula, with its legend', async () => {
    const el = await createView('CCO | Éthanol\nc1ccccc1');
    expect(parse).toHaveBeenCalledTimes(2);
    expect(drawerOptions).toHaveBeenCalledWith({ compactDrawing: false });
    expect(draw.mock.calls[0][2]).toBe('light');
    const boards = el.querySelectorAll('.smiles-view__board');
    expect(boards).toHaveLength(2);
    expect(boards[0].getAttribute('aria-label')).toBe('Éthanol');
    expect(boards[1].getAttribute('aria-label')).toBe('Molécule c1ccccc1');
    expect(el.querySelector('figcaption')?.textContent?.trim()).toBe('Éthanol');
  });

  it('sizes the SVG from its viewBox and strips its global <style>', async () => {
    const el = await createView('CCO');
    const svg = el.querySelector('.smiles-view__board svg');
    expect(svg?.getAttribute('width')).toBe('120');
    expect(svg?.getAttribute('height')).toBe('60');
    expect(svg?.querySelector('style')).toBeNull();
    // Masque et référence conservés (le dessin des liaisons en dépend).
    expect(svg?.querySelector('mask')?.id).toBe('m-text-mask');
    expect(svg?.querySelector('g')?.getAttribute('mask')).toBe('url(#m-text-mask)');
  });

  it('an invalid molecule shows its notice without blocking the others', async () => {
    const el = await createView('C!C | Faux\nCCO | Éthanol');
    const boards = el.querySelectorAll('.smiles-view__board');
    expect(boards[0].classList).toContain('smiles-view__board--empty');
    expect(boards[0].childElementCount).toBe(0);
    expect(boards[1].querySelector('svg')).not.toBeNull();
    const error = el.querySelector('.smiles-view__error');
    expect(error?.textContent).toContain('SMILES invalide');
    expect(error?.querySelector('code')?.textContent).toBe('C!C');
  });

  it('refuses an oversized SMILES without calling the parser', async () => {
    const el = await createView('C'.repeat(401));
    expect(parse).not.toHaveBeenCalled();
    expect(el.querySelector('.smiles-view__error')).not.toBeNull();
  });
});
