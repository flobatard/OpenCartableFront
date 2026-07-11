import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { JsxgraphView } from './jsxgraph-view';

// jsdom ne rend pas de SVG : on mocke la lib et on vérifie les appels dérivés
// de la config (comme mermaid, jamais testé en vrai rendu).
const snippet = vi.fn().mockReturnValue(() => 0);
const create = vi.fn();
const fakeBoard = { jc: { snippet }, create };
const initBoard = vi.fn().mockReturnValue(fakeBoard);
const freeBoard = vi.fn();

vi.mock('jsxgraph', () => ({ default: { JSXGraph: { initBoard, freeBoard } } }));

/** Laisse l'import dynamique mocké et le tracé async se résoudre. */
async function flushDraw(fixture: { detectChanges: () => void }): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

function createView(source: string) {
  const fixture = TestBed.createComponent(JsxgraphView);
  fixture.componentRef.setInput('source', source);
  fixture.detectChanges();
  return fixture;
}

describe('JsxgraphView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initBoard.mockReturnValue(fakeBoard);
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
  });

  it('initialise le board avec la bbox et trace équations et points', async () => {
    const fixture = createView('equation="x^2"\npoint="2,2"\nbbox="-1,1,1,-1"');
    await flushDraw(fixture);

    expect(initBoard).toHaveBeenCalledTimes(1);
    expect(initBoard.mock.calls[0][1]).toMatchObject({
      boundingbox: [-1, 1, 1, -1],
      showNavigation: false,
      showCopyright: false,
    });
    expect(snippet).toHaveBeenCalledWith('x^2', true, 'x', true);
    expect(create).toHaveBeenCalledWith('functiongraph', [expect.any(Function)]);
    expect(create).toHaveBeenCalledWith('point', [2, 2], { fixed: true });
    expect(fixture.nativeElement.querySelector('.jsxgraph-view__error')).toBeNull();
  });

  it('affiche la notice quand le tracé échoue', async () => {
    initBoard.mockImplementation(() => {
      throw new Error('boom');
    });
    const fixture = createView('equation=x');
    await flushDraw(fixture);
    expect(fixture.nativeElement.querySelector('.jsxgraph-view__error')).not.toBeNull();
  });

  it('libère le board précédent au re-tracé et à la destruction', async () => {
    const fixture = createView('equation=x');
    await flushDraw(fixture);
    expect(freeBoard).not.toHaveBeenCalled();

    fixture.componentRef.setInput('source', 'equation=2*x');
    fixture.detectChanges();
    await flushDraw(fixture);
    expect(freeBoard).toHaveBeenCalledTimes(1);
    expect(freeBoard).toHaveBeenCalledWith(fakeBoard);

    fixture.destroy();
    expect(freeBoard).toHaveBeenCalledTimes(2);
  });
});
