import { ComponentFixture, TestBed } from '@angular/core/testing';
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
    }).compileComponents();
    const fixture = TestBed.createComponent(MarkdownHelpDialog);
    await fixture.whenStable();
    return fixture;
  }

  function dialog(fixture: ComponentFixture<MarkdownHelpDialog>): HTMLDialogElement {
    return (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
  }

  it('rend les trois sections (markdown, LaTeX, mermaid) et l’exemple', async () => {
    const fixture = await createComponent();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Markdown');
    expect(text).toContain('LaTeX');
    expect(text).toContain('Mermaid');
    // La limitation LaTeX-dans-Mermaid est documentée.
    expect(text).toContain('nœuds Mermaid');
    // L'exemple mermaid est rendu tel quel dans un <pre>.
    expect(fixture.nativeElement.querySelector('.md-help__code')?.textContent).toContain('graph TD');
  });

  it('open() ouvre la modale, close() la ferme', async () => {
    const fixture = await createComponent();
    // jsdom n'implémente pas showModal/close : on les remplace par des stubs.
    const showModal = (dialog(fixture).showModal = vi.fn());
    const close = (dialog(fixture).close = vi.fn());

    fixture.componentInstance.open();
    expect(showModal).toHaveBeenCalledOnce();

    fixture.componentInstance.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('un clic sur le fond (la <dialog> elle-même) ferme', async () => {
    const fixture = await createComponent();
    const close = (dialog(fixture).close = vi.fn());

    dialog(fixture).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('un clic sur un enfant ne ferme pas', async () => {
    const fixture = await createComponent();
    const close = (dialog(fixture).close = vi.fn());

    fixture.nativeElement.querySelector('.md-help__title')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(close).not.toHaveBeenCalled();
  });
});
