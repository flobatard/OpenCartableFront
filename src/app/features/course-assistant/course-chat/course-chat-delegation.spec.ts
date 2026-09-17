import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { CourseChatDelegation, DelegationChildView } from './course-chat-delegation';

const DELEGATION = {
  id: 'call_d',
  context: 'block_text' as const,
  targetId: '11111111-1111-4111-8111-111111111111',
  targetTitle: 'Introduction',
  instructions: 'Réécris le bloc.',
};

describe('CourseChatDelegation', () => {
  async function createComponent(inputs: {
    status: 'running' | 'done' | 'error';
    result?: string | null;
    children?: DelegationChildView[];
  }): Promise<ComponentFixture<CourseChatDelegation>> {
    await TestBed.configureTestingModule({
      imports: [CourseChatDelegation, provideTranslocoTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseChatDelegation);
    fixture.componentRef.setInput('delegation', DELEGATION);
    fixture.componentRef.setInput('status', inputs.status);
    fixture.componentRef.setInput('result', inputs.result ?? null);
    fixture.componentRef.setInput('children', inputs.children ?? []);
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: ComponentFixture<CourseChatDelegation>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the target, the instructions and the running hint', async () => {
    const fixture = await createComponent({ status: 'running' });
    const card = el(fixture).querySelector('.chat-delegation')!;
    expect(card.classList.contains('chat-delegation--running')).toBe(true);
    expect(card.querySelector('.chat-delegation__title')?.textContent).toContain(
      "Sous-assistant d'édition",
    );
    expect(card.querySelector('.chat-delegation__target')?.textContent).toContain('Introduction');
    expect(card.querySelector('.chat-delegation__instructions-text')?.textContent).toBe(
      'Réécris le bloc.',
    );
    expect(card.querySelector('.chat-delegation__pending')?.textContent).toContain('travaille');
    expect(card.querySelector('.chat-delegation__activity')).toBeNull();
  });

  it('nests the sub-assistant activity: tool rows and a reviewable proposal card', async () => {
    const review = vi.fn();
    const fixture = await createComponent({
      status: 'running',
      children: [
        {
          kind: 'tool',
          tool: {
            id: 'c1',
            name: 'read_block',
            args: { block_ref: 'B1' },
            status: 'done',
            result: 'x',
          },
        },
        {
          kind: 'proposal',
          tool: {
            id: 'c2',
            name: 'propose_block_edit',
            args: { new_markdown: '# V2' },
            status: 'running',
            result: null,
          },
          summary: 'Réécriture',
        },
      ],
    });
    fixture.componentInstance.review.subscribe(review);

    const activity = el(fixture).querySelector('.chat-delegation__activity')!;
    expect(activity.querySelector('app-course-chat-tool summary')?.textContent).toContain(
      "Lecture d'un bloc",
    );
    const proposal = activity.querySelector('app-course-chat-proposal')!;
    expect(proposal.querySelector('.chat-proposal__summary')?.textContent).toBe('Réécriture');
    expect(proposal.querySelector('.chat-proposal__pending')?.textContent).toContain('fenêtre');
    proposal.querySelector<HTMLButtonElement>('.chat-proposal__review')!.click();
    expect(review).toHaveBeenCalledTimes(1);
  });

  it('shows the report once the sub-assistant is done', async () => {
    const fixture = await createComponent({ status: 'done', result: 'Sous-assistant terminé.' });
    const card = el(fixture).querySelector('.chat-delegation')!;
    expect(card.classList.contains('chat-delegation--running')).toBe(false);
    expect(card.querySelector('.chat-delegation__pending')).toBeNull();
    expect(card.querySelector('.chat-delegation__result')?.textContent).toBe(
      'Sous-assistant terminé.',
    );
  });
});
