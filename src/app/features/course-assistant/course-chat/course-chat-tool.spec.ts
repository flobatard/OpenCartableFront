import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { ChatToolView, CourseChatTool, toolResultExcerpt } from './course-chat-tool';

describe('CourseChatTool', () => {
  async function createComponent(tool: ChatToolView): Promise<ComponentFixture<CourseChatTool>> {
    await TestBed.configureTestingModule({
      imports: [CourseChatTool, provideTranslocoTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseChatTool);
    fixture.componentRef.setInput('tool', tool);
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: ComponentFixture<CourseChatTool>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the tool label, its parameters and the result excerpt', async () => {
    const fixture = await createComponent({
      id: 'c1',
      name: 'read_block',
      args: { block_id: 'b1', options: { deep: true } },
      status: 'done',
      result: '### Bloc 1 — Intro…',
    });

    const details = el(fixture).querySelector('details.chat-tool')!;
    expect(details.classList.contains('chat-tool--error')).toBe(false);
    expect(details.querySelector('summary')?.textContent).toContain("Lecture d'un bloc du cours");
    const terms = Array.from(details.querySelectorAll('dt')).map((dt) => dt.textContent);
    const values = Array.from(details.querySelectorAll('dd')).map((dd) => dd.textContent);
    expect(terms).toEqual(['block_id', 'options']);
    expect(values).toEqual(['b1', '{"deep":true}']);
    expect(details.querySelector('.chat-tool__result')?.textContent).toBe('### Bloc 1 — Intro…');
  });

  it('shows the failure state and the error message', async () => {
    const fixture = await createComponent({
      id: 'c1',
      name: 'read_resource_image',
      args: { resource_id: 'r1' },
      status: 'error',
      result: "Cette ressource n'est pas une image lisible",
    });

    const details = el(fixture).querySelector('details.chat-tool')!;
    expect(details.classList.contains('chat-tool--error')).toBe(true);
    expect(details.querySelector('summary')?.textContent).toContain('échec');
    expect(details.querySelector('summary')?.textContent).toContain('image de la bibliothèque');
    expect(details.querySelector('.chat-tool__heading:last-of-type')?.textContent).toContain(
      'Erreur',
    );
    expect(details.querySelector('.chat-tool__result')?.textContent).toContain('pas une image');
  });

  it('falls back to a generic label for unknown tools and marks a running call', async () => {
    const fixture = await createComponent({
      id: 'c9',
      name: 'future_tool',
      args: {},
      status: 'running',
      result: null,
    });

    const details = el(fixture).querySelector('details.chat-tool')!;
    expect(details.querySelector('summary')?.textContent).toContain("Utilisation d'un outil");
    expect(details.querySelector('summary')?.textContent).toContain('en cours');
    expect(details.textContent).toContain('Aucun paramètre');
    expect(details.querySelector('.chat-tool__result')).toBeNull();
  });

  it('says when no result is available', async () => {
    const fixture = await createComponent({
      id: 'c1',
      name: 'read_module',
      args: { module_id: 'm1' },
      status: 'done',
      result: null,
    });
    expect(el(fixture).textContent).toContain('Résultat indisponible');
  });

  it('toolResultExcerpt caps long contents with an ellipsis', () => {
    expect(toolResultExcerpt('court')).toBe('court');
    const long = 'x'.repeat(1000);
    expect(toolResultExcerpt(long)).toBe('x'.repeat(400) + '…');
  });
});
