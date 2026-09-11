import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MarkdownHelpDialog } from './markdown-help-dialog';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

/**
 * jsdom n'implémente pas la vraie modalité de <dialog> (showModal/close) : on
 * espionne les méthodes natives plutôt que d'observer l'état `open`.
 */
describe('MarkdownHelpDialog', () => {
  async function createComponent(): Promise<ComponentFixture<MarkdownHelpDialog>> {
    await TestBed.configureTestingModule({
      imports: [MarkdownHelpDialog, provideTranslocoTesting()],
      // RouterLink des liens « documentation complète ».
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(MarkdownHelpDialog);
    await fixture.whenStable();
    return fixture;
  }

  function dialog(fixture: ComponentFixture<MarkdownHelpDialog>): HTMLDialogElement {
    return (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
  }

  it('renders the three sections (markdown, LaTeX, mermaid) and the example', async () => {
    const fixture = await createComponent();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Markdown');
    expect(text).toContain('LaTeX');
    expect(text).toContain('Mermaid');
    // La limitation LaTeX-dans-Mermaid est documentée.
    expect(text).toContain('nœuds Mermaid');
    // Les exemples tableau et mermaid sont rendus tels quels dans des <pre>.
    const examples = [...fixture.nativeElement.querySelectorAll('.md-help__code')].map(
      (pre) => (pre as HTMLElement).textContent ?? '',
    );
    expect(examples.some((code) => code.includes('| Colonne A |'))).toBe(true);
    expect(examples.some((code) => code.includes('graph TD'))).toBe(true);
    expect(examples.some((code) => code.includes('\\ce{2H2 + O2 -> 2H2O}'))).toBe(true);
  });

  it('renders the GeoGebra and JSXGraph sections with their example', async () => {
    const fixture = await createComponent();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('GeoGebra');
    expect(text).toContain('JSXGraph');
    const examples = [...fixture.nativeElement.querySelectorAll('.md-help__code')].map(
      (pre) => (pre as HTMLElement).textContent ?? '',
    );
    expect(examples.some((code) => code.includes('```geogebra'))).toBe(true);
    expect(examples.some((code) => code.includes('```jsxgraph'))).toBe(true);
    expect(examples.some((code) => code.includes('```tikz'))).toBe(true);
    expect(examples.some((code) => code.includes('```timeline'))).toBe(true);
    expect(examples.some((code) => code.includes('```smiles'))).toBe(true);
    expect(examples.some((code) => code.includes('```vegalite'))).toBe(true);
    expect(examples.some((code) => code.includes('```abc'))).toBe(true);
    expect(examples.some((code) => code.includes('```sql'))).toBe(true);
    expect(examples.some((code) => code.includes('```python'))).toBe(true);
  });

  it('each section links to its doc page in a new tab', async () => {
    const fixture = await createComponent();
    const links = [
      ...fixture.nativeElement.querySelectorAll('a[href*="markdown-language/docs"]'),
    ] as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/fr/markdown-language/docs',
      '/fr/markdown-language/docs/katex',
      '/fr/markdown-language/docs/mhchem',
      '/fr/markdown-language/docs/mermaid',
      '/fr/markdown-language/docs/geogebra',
      '/fr/markdown-language/docs/jsxgraph',
      '/fr/markdown-language/docs/tikz',
      '/fr/markdown-language/docs/timeline',
      '/fr/markdown-language/docs/smiles',
      '/fr/markdown-language/docs/vegalite',
      '/fr/markdown-language/docs/abc',
      '/fr/markdown-language/docs/sql',
      '/fr/markdown-language/docs/python',
    ]);
    // _blank : RouterLink n'intercepte pas — la modale et l'édition restent en place.
    expect(links.every((a) => a.getAttribute('target') === '_blank')).toBe(true);
  });

  it('open() opens the dialog, close() closes it', async () => {
    const fixture = await createComponent();
    // jsdom n'implémente pas showModal/close : on les remplace par des stubs.
    const showModal = (dialog(fixture).showModal = vi.fn());
    const close = (dialog(fixture).close = vi.fn());

    fixture.componentInstance.open();
    expect(showModal).toHaveBeenCalledOnce();

    fixture.componentInstance.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('a backdrop click (the <dialog> itself) closes', async () => {
    const fixture = await createComponent();
    const close = (dialog(fixture).close = vi.fn());

    dialog(fixture).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('a click on a child does not close', async () => {
    const fixture = await createComponent();
    const close = (dialog(fixture).close = vi.fn());

    fixture.nativeElement.querySelector('.md-help__title')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(close).not.toHaveBeenCalled();
  });
});
