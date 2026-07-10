import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarkdownView } from './markdown-view';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

/**
 * Le rendu markdown+KaTeX (marked) tourne en jsdom ; la passe Mermaid, non
 * (elle exige un vrai navigateur) — on n'asserte donc que la sortie synchrone.
 */
describe('MarkdownView', () => {
  async function createComponent(markdown: string): Promise<ComponentFixture<MarkdownView>> {
    await TestBed.configureTestingModule({
      imports: [MarkdownView, provideTranslocoTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(MarkdownView);
    fixture.componentRef.setInput('markdown', markdown);
    await fixture.whenStable();
    return fixture;
  }

  function content(fixture: ComponentFixture<MarkdownView>): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.markdown-view__content');
  }

  it('rend le markdown en HTML dans .course-content', async () => {
    const fixture = await createComponent('## Section');
    expect(content(fixture)?.innerHTML).toContain('<h2>');
    expect(content(fixture)?.classList.contains('course-content')).toBe(true);
  });

  it('rend les formules LaTeX via KaTeX', async () => {
    const fixture = await createComponent('Soit $x^2$ un carré.');
    expect(content(fixture)?.querySelector('.katex')).toBeTruthy();
  });

  it('un markdown vide ne rend aucun contenu', async () => {
    const fixture = await createComponent('');
    expect(content(fixture)?.innerHTML.trim()).toBe('');
  });
});
