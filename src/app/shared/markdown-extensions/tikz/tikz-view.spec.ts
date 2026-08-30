import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { TikzView } from './tikz-view';
import { TikzJaxLoader } from './tikzjax-loader';

// jsdom n'exécute jamais le vrai script TikZJax : on mocke le loader (par le
// TestBed — `vi.mock` est interdit sur les imports relatifs par le builder)
// et on simule à la main les remplacements DOM que ferait son
// MutationObserver (succès = SVG + événement `tikzjax-load-finished` ; échec
// TeX = <img> sans événement — comportements vérifiés dans le source du fork).
const load = vi.fn<() => Promise<void>>();

/** Laisse le chargement mocké, l'effect async et les microtasks se résoudre. */
async function flush(fixture: { detectChanges: () => void }): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

function createView(source: string) {
  const fixture = TestBed.createComponent(TikzView);
  fixture.componentRef.setInput('source', source);
  fixture.detectChanges();
  return fixture;
}

describe('TikzView', () => {
  beforeEach(() => {
    load.mockReset();
    load.mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [{ provide: TikzJaxLoader, useValue: { load } }],
    });
  });

  it('inserts the text/tikz script (wrapped source) and stays loading', async () => {
    const fixture = createView('\\draw (0,0) -- (1,1);');
    await flush(fixture);

    const script = fixture.nativeElement.querySelector('script[type="text/tikz"]');
    expect(script).not.toBeNull();
    expect(script.textContent).toContain('\\begin{tikzpicture}');
    // La compilation est asynchrone : tant que TikZJax n'a rien remplacé, on charge.
    expect(fixture.nativeElement.querySelector('.tikz-view__loading')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.tikz-view__error')).toBeNull();
  });

  it('shows the re-sanitized SVG on tikzjax-load-finished', async () => {
    const fixture = createView('\\draw (0,0) -- (1,1);');
    await flush(fixture);

    const container = fixture.nativeElement.querySelector('.tikz-view__container');
    container.innerHTML = '<svg><g onclick="alert(1)"><path d="M0 0"></path></g></svg>';
    container.firstChild.dispatchEvent(new Event('tikzjax-load-finished', { bubbles: true }));
    await flush(fixture);

    expect(fixture.nativeElement.querySelector('.tikz-view__loading')).toBeNull();
    expect(fixture.nativeElement.querySelector('.tikz-view__error')).toBeNull();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // La re-sanitisation DOMPurify a purgé le gestionnaire inline.
    expect(container.querySelector('[onclick]')).toBeNull();
  });

  it("flags invalid TeX code when TikZJax drops its error image", async () => {
    const fixture = createView('\\draw oups');
    await flush(fixture);

    const container = fixture.nativeElement.querySelector('.tikz-view__container');
    container.innerHTML = '<img src="//invalid.site/img-not-found.png">';
    await flush(fixture); // MutationObserver = microtask

    const error = fixture.nativeElement.querySelector('.tikz-view__error');
    expect(error).not.toBeNull();
    expect(error.textContent).toContain('Code TikZ invalide');
    expect(container.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.tikz-view__loading')).toBeNull();
  });

  it("shows the load error when TikZJax cannot be loaded", async () => {
    load.mockRejectedValueOnce(new Error('réseau'));
    const fixture = createView('\\draw (0,0) -- (1,1);');
    await flush(fixture);

    const error = fixture.nativeElement.querySelector('.tikz-view__error');
    expect(error).not.toBeNull();
    expect(error.textContent).toContain("n'a pas pu être chargé");
  });
});
