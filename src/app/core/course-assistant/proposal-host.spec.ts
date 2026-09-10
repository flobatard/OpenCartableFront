import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Mock, vi } from 'vitest';
import { ProposalHost, ProposalHostDeps } from './proposal-host';
import { AssistantPendingProposal } from './proposals';

interface Review {
  id: string;
  original: string;
}

function textProposal(id: string, markdown = '# V2'): AssistantPendingProposal {
  return { kind: 'block_text', id, summary: null, markdown };
}

/** Proposition dont la cible a disparu : l'hôte de test ne sait pas l'appliquer. */
const VANISHED: AssistantPendingProposal = {
  kind: 'exercise_question_edit',
  id: 'call_x',
  summary: null,
  questionId: 'disparue',
  statement: 'Nouvel énoncé',
  expectedAnswer: null,
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ProposalHost', () => {
  let pending: ReturnType<typeof signal<AssistantPendingProposal | null>>;
  let resumeProposal: Mock<(decision: object) => Promise<boolean>>;
  let apply: Mock<(proposal: AssistantPendingProposal) => boolean>;
  let content: string;
  let autoMode: boolean;

  beforeEach(() => {
    pending = signal<AssistantPendingProposal | null>(null);
    // Comme le vrai état : la proposition est consommée à l'ouverture du flux.
    resumeProposal = vi.fn(async () => {
      pending.set(null);
      return true;
    });
    content = '# V1';
    autoMode = false;
    apply = vi.fn((proposal: AssistantPendingProposal) => {
      if (proposal.kind !== 'block_text') {
        return false;
      }
      content = proposal.markdown;
      return true;
    });
  });

  function deps(withAuto: boolean): ProposalHostDeps<Review> {
    return {
      state: { pendingProposal: pending, resumeProposal } as unknown as ProposalHostDeps<Review>['state'],
      buildReview: (proposal) => ({ id: proposal.id, original: content }),
      apply,
      ...(withAuto ? { autoAccept: () => autoMode } : {}),
    };
  }

  function create(): ProposalHost<Review> {
    return TestBed.runInInjectionContext(() => new ProposalHost<Review>(deps(true)));
  }

  function propose(proposal: AssistantPendingProposal): void {
    pending.set(proposal);
    TestBed.tick();
  }

  it('without autoAccept: plain class, no injection context needed, review then accept', async () => {
    const host = new ProposalHost<Review>(deps(false));
    pending.set(textProposal('call_1'));
    expect(host.review()).toEqual({ id: 'call_1', original: '# V1' });

    await host.accept('Parfait');
    expect(apply).toHaveBeenCalledTimes(1);
    expect(resumeProposal).toHaveBeenCalledWith({ accepted: true, comment: 'Parfait' });
  });

  it('ask mode: the review is shown, nothing is applied nor sent', () => {
    const host = create();
    propose(textProposal('call_1'));

    expect(host.review()).toEqual({ id: 'call_1', original: '# V1' });
    expect(apply).not.toHaveBeenCalled();
    expect(resumeProposal).not.toHaveBeenCalled();
  });

  it('auto mode: applies then resumes accepted, the review never shows', async () => {
    autoMode = true;
    let release!: (resumed: boolean) => void;
    resumeProposal.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (release = resolve)),
    );
    const host = create();
    propose(textProposal('call_1'));

    // Décision en vol : appliquée, envoyée, revue masquée.
    expect(content).toBe('# V2');
    expect(resumeProposal).toHaveBeenCalledWith({ accepted: true, auto: true });
    expect(host.busy()).toBe(true);
    expect(host.review()).toBeNull();

    pending.set(null);
    release(true);
    await flush();
    expect(host.busy()).toBe(false);
    expect(host.error()).toBeNull();
    expect(host.review()).toBeNull();
  });

  it('switching to auto while a review is open does not decide it', async () => {
    const host = create();
    propose(textProposal('call_1'));
    expect(host.review()).not.toBeNull();

    autoMode = true;
    TestBed.tick();
    expect(apply).not.toHaveBeenCalled();
    expect(host.review()).not.toBeNull();

    // Le clic reste une décision manuelle (pas de marque `auto`).
    await host.accept('');
    expect(resumeProposal).toHaveBeenCalledWith({ accepted: true });

    // La proposition suivante, elle, part en auto.
    propose(textProposal('call_2', '# V3'));
    expect(resumeProposal).toHaveBeenLastCalledWith({ accepted: true, auto: true });
    expect(content).toBe('# V3');
  });

  it('auto mode on a vanished target: nothing sent, falls back to the review with `target`', async () => {
    autoMode = true;
    const host = create();
    propose(VANISHED);
    await flush();

    expect(resumeProposal).not.toHaveBeenCalled();
    expect(host.error()).toBe('target');
    expect(host.review()).toEqual({ id: 'call_x', original: '# V1' });
  });

  it('auto mode with a failed resume: review with `decision` and the pre-apply original, one attempt only', async () => {
    autoMode = true;
    resumeProposal.mockResolvedValue(false); // la proposition reste en attente
    const host = create();
    propose(textProposal('call_1'));
    await flush();

    expect(host.error()).toBe('decision');
    // « Original » figé AVANT l'application : le diff reste lisible.
    expect(content).toBe('# V2');
    expect(host.review()).toEqual({ id: 'call_1', original: '# V1' });

    // Aucune nouvelle tentative automatique sur la même proposition.
    TestBed.tick();
    await flush();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(resumeProposal).toHaveBeenCalledTimes(1);
  });
});
