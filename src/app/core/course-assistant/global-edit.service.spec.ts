import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AnalyticsService } from '../analytics/analytics.service';
import { GlobalEditService } from './global-edit.service';

const KEY = 'oc-assistant-global-edit';

describe('GlobalEditService', () => {
  afterEach(() => {
    localStorage.removeItem(KEY);
    vi.restoreAllMocks();
  });

  it('is off by default', () => {
    expect(TestBed.inject(GlobalEditService).enabled()).toBe(false);
  });

  it('restores the stored choice; an unknown value falls back to off', () => {
    localStorage.setItem(KEY, 'on');
    expect(TestBed.inject(GlobalEditService).enabled()).toBe(true);

    TestBed.resetTestingModule();
    localStorage.setItem(KEY, 'yes');
    expect(TestBed.inject(GlobalEditService).enabled()).toBe(false);
  });

  it('toggle persists the choice and captures an enumerated event', () => {
    const capture = vi.spyOn(TestBed.inject(AnalyticsService), 'capture');
    const service = TestBed.inject(GlobalEditService);

    service.toggle();
    expect(service.enabled()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('on');
    expect(capture).toHaveBeenCalledWith('assistant_global_edit_changed', { enabled: true });

    service.toggle();
    expect(service.enabled()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('off');

    // Même valeur : ni écriture ni événement.
    capture.mockClear();
    service.setEnabled(false);
    expect(capture).not.toHaveBeenCalled();
  });

  it('an unavailable storage is tolerated (the choice holds for the page)', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const service = TestBed.inject(GlobalEditService);
    expect(service.enabled()).toBe(false);
    service.setEnabled(true);
    expect(service.enabled()).toBe(true);
  });

  it('never reads nor writes the storage on the server', () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    localStorage.setItem(KEY, 'on');
    const service = TestBed.inject(GlobalEditService);
    expect(service.enabled()).toBe(false);
    service.setEnabled(true);
    expect(service.enabled()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('on');
  });
});
