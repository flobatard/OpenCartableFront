import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { CourseAssistantService } from '../../../core/course-assistant/course-assistant.service';
import { AssistantPendingProposal } from '../../../core/course-assistant/proposals';
import { mockCourseAssistantService } from '../../../testing/assistant.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { ProposalReview } from '../proposal-review/proposal-review';
import { StructureProposalReview } from '../proposal-review/structure-proposal-review';
import { GlobalProposalReview } from './global-proposal-review';

const DELEGATION = {
  id: 'call_d',
  context: 'block_text' as const,
  targetId: '11111111-1111-4111-8111-111111111111',
  targetTitle: 'Introduction',
  instructions: 'Réécris.',
};

const TEXT: AssistantPendingProposal = {
  kind: 'block_text',
  id: 'call_c',
  summary: 'Réécriture',
  markdown: '# V2',
  delegation: DELEGATION,
};

describe('GlobalProposalReview', () => {
  let assistant: ReturnType<typeof mockCourseAssistantService>;
  let showModal: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;

  async function createComponent(): Promise<ComponentFixture<GlobalProposalReview>> {
    assistant = mockCourseAssistantService();
    await TestBed.configureTestingModule({
      imports: [GlobalProposalReview, provideTranslocoTesting()],
      providers: [{ provide: CourseAssistantService, useValue: assistant }],
    }).compileComponents();
    const fixture = TestBed.createComponent(GlobalProposalReview);
    fixture.componentRef.setInput('courseId', 'c1');
    const dialog = (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>(
      'dialog',
    )!;
    showModal = vi.fn(() => {
      dialog.setAttribute('open', '');
    });
    close = vi.fn(() => {
      dialog.removeAttribute('open');
    });
    dialog.showModal = showModal as unknown as HTMLDialogElement['showModal'];
    dialog.close = close as unknown as HTMLDialogElement['close'];
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<GlobalProposalReview>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function showText(fixture: ComponentFixture<GlobalProposalReview>): void {
    assistant.pendingProposal.set(TEXT);
    assistant.proposals.pending.set(TEXT);
    assistant.proposals.review.set({
      kind: 'text',
      proposal: TEXT,
      original: '# V1',
      targetTitle: 'Introduction',
    });
    fixture.detectChanges();
  }

  it('stays closed and empty without a review', async () => {
    const fixture = await createComponent();
    expect(showModal).not.toHaveBeenCalled();
    expect(el(fixture).querySelector('app-proposal-review')).toBeNull();
    expect(el(fixture).querySelector('.global-proposal-review__loading')).toBeNull();
  });

  it('opens on reviewVisible with the text review and the target in its title', async () => {
    const fixture = await createComponent();
    showText(fixture);
    assistant.showReview();
    fixture.detectChanges();

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(el(fixture).querySelector('.global-proposal-review__title')?.textContent).toContain(
      'Introduction',
    );
    const review = fixture.debugElement.query(By.directive(ProposalReview));
    expect(review).toBeTruthy();
    expect(review.componentInstance.original()).toBe('# V1');
    expect(review.componentInstance.proposal()).toEqual({
      id: 'call_c',
      markdown: '# V2',
      summary: 'Réécriture',
    });

    // Décision : relayée à l'hôte global.
    review.componentInstance.accepted.emit('Parfait');
    expect(assistant.proposals.accept).toHaveBeenCalledWith('Parfait');
    review.componentInstance.rejected.emit('');
    expect(assistant.proposals.reject).toHaveBeenCalledWith('');
  });

  it('closes when the service hides the review; the close event hides it', async () => {
    const fixture = await createComponent();
    showText(fixture);
    assistant.showReview();
    fixture.detectChanges();
    assistant.hideReview();
    fixture.detectChanges();
    expect(close).toHaveBeenCalledTimes(1);

    assistant.showReview();
    fixture.detectChanges();
    el(fixture).querySelector('dialog')!.dispatchEvent(new Event('close'));
    expect(assistant.hideReview).toHaveBeenCalledTimes(2);
  });

  it('shows the loading state with a reject button while the target loads', async () => {
    const fixture = await createComponent();
    assistant.pendingProposal.set(TEXT);
    assistant.proposals.pending.set(TEXT);
    fixture.detectChanges();

    const loading = el(fixture).querySelector('.global-proposal-review__loading')!;
    expect(loading).toBeTruthy();
    expect(el(fixture).querySelector('.global-proposal-review__title')?.textContent).toContain(
      'Introduction',
    );
    loading.querySelector('button')!.click();
    expect(assistant.proposals.reject).toHaveBeenCalledWith('');
  });

  it('maps the host error to the review error key', async () => {
    const fixture = await createComponent();
    showText(fixture);
    (assistant.proposals.error as ReturnType<typeof signal<string | null>>).set('apply');
    fixture.detectChanges();
    const review = fixture.debugElement.query(By.directive(ProposalReview));
    expect(review.componentInstance.errorKey()).toBe('courseChat.proposal.applyError');
  });

  it('renders a structure proposal of the global assistant, named after the course', async () => {
    const fixture = await createComponent();
    const proposal: AssistantPendingProposal = {
      kind: 'block_delete',
      id: 'call_s',
      summary: null,
      blockId: 'b-1',
      targetTitle: 'Intro',
    };
    assistant.pendingProposal.set(proposal);
    assistant.proposals.pending.set(proposal);
    assistant.proposals.review.set({
      kind: 'structure',
      proposal,
      blocks: [],
      targetTitle: 'Géométrie',
    });
    (assistant.proposals.error as ReturnType<typeof signal<string | null>>).set('target');
    fixture.detectChanges();

    const review = fixture.debugElement.query(By.directive(StructureProposalReview));
    expect(review).toBeTruthy();
    expect(el(fixture).querySelector('.global-proposal-review__title')?.textContent).toContain(
      'Géométrie',
    );
    // Cible = le cours : l'erreur `target` a son propre message.
    expect(review.componentInstance.errorKey()).toBe('courseChat.proposal.structure.targetError');
    review.componentInstance.rejected.emit('Non');
    expect(assistant.proposals.reject).toHaveBeenCalledWith('Non');
  });
});
