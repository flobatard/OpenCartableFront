import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AnalyticsService } from '../analytics/analytics.service';
import { ProposalModeService } from './proposal-mode.service';
import { AssistantPendingProposal } from './proposals';

const KEY = 'oc-assistant-proposal-mode';

const TEXT: AssistantPendingProposal = {
  kind: 'block_text',
  id: 'call_t',
  summary: null,
  markdown: '# V2',
};

const DELETE: AssistantPendingProposal = {
  kind: 'exercise_question_delete',
  id: 'call_d',
  summary: null,
  questionId: 'q-1',
};

describe('ProposalModeService', () => {
  afterEach(() => {
    localStorage.removeItem(KEY);
    vi.restoreAllMocks();
  });

  it("defaults to 'ask': nothing is auto-accepted", () => {
    const service = TestBed.inject(ProposalModeService);
    expect(service.mode()).toBe('ask');
    expect(service.shouldAutoAccept(TEXT)).toBe(false);
  });

  it('restores the stored mode; an unknown value falls back to ask', () => {
    localStorage.setItem(KEY, 'auto');
    expect(TestBed.inject(ProposalModeService).mode()).toBe('auto');

    TestBed.resetTestingModule();
    localStorage.setItem(KEY, 'yolo');
    expect(TestBed.inject(ProposalModeService).mode()).toBe('ask');
  });

  it('toggle persists the mode and captures an enumerated event', () => {
    const capture = vi.spyOn(TestBed.inject(AnalyticsService), 'capture');
    const service = TestBed.inject(ProposalModeService);

    service.toggle();
    expect(service.mode()).toBe('auto');
    expect(localStorage.getItem(KEY)).toBe('auto');
    expect(capture).toHaveBeenCalledWith('assistant_proposal_mode_changed', { mode: 'auto' });

    service.toggle();
    expect(service.mode()).toBe('ask');
    expect(localStorage.getItem(KEY)).toBe('ask');

    // Même mode : ni écriture ni événement.
    capture.mockClear();
    service.setMode('ask');
    expect(capture).not.toHaveBeenCalled();
  });

  it('an unavailable storage is tolerated (the mode holds for the page)', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const service = TestBed.inject(ProposalModeService);
    expect(service.mode()).toBe('ask');
    service.setMode('auto');
    expect(service.mode()).toBe('auto');
  });

  it('never reads nor writes the storage on the server', () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    localStorage.setItem(KEY, 'auto');
    const service = TestBed.inject(ProposalModeService);
    expect(service.mode()).toBe('ask');
    service.setMode('auto');
    expect(service.mode()).toBe('auto');
  });

  it('auto mode accepts everything but a question removal (always reviewed)', () => {
    const service = TestBed.inject(ProposalModeService);
    service.setMode('auto');
    expect(service.shouldAutoAccept(TEXT)).toBe(true);
    expect(
      service.shouldAutoAccept({ kind: 'module_js', id: 'call_m', summary: null, code: 'x' }),
    ).toBe(true);
    expect(service.shouldAutoAccept(DELETE)).toBe(false);
  });
});
