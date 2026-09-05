import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { ResourceService } from '../../core/resources/resource.service';
import { MarkdownPlayground } from './markdown-playground';
import { mockResourceService } from '../../testing/service-mocks';

/** MarkdownView (réel) injecte ResourceService : mock signaux, jamais de HTTP. */
const resourcesMock = mockResourceService([]);

function createPlayground(initial: string) {
  const fixture = TestBed.createComponent(MarkdownPlayground);
  fixture.componentRef.setInput('initial', initial);
  fixture.detectChanges();
  return fixture;
}

describe('MarkdownPlayground', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [{ provide: ResourceService, useValue: resourcesMock }],
    });
  });

  it('seeds the initial example in the control AND the preview, without waiting for the debounce', async () => {
    const fixture = createPlayground('## Bonjour');
    await fixture.whenStable();
    const component = fixture.componentInstance;
    expect(component.control.value).toBe('## Bonjour');
    expect(fixture.nativeElement.querySelector('.course-content')?.innerHTML).toContain('<h2>');
  });

  it('reflects typing in the preview after the debounce (jsdom drives the control)', async () => {
    vi.useFakeTimers();
    try {
      const fixture = createPlayground('avant');
      fixture.componentInstance.control.setValue('## après');
      await vi.advanceTimersByTimeAsync(500);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.course-content')?.textContent).toContain(
        'après',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reset the input when the initial input changes (read once)', async () => {
    const fixture = createPlayground('premier');
    fixture.componentInstance.control.setValue('saisie en cours');
    fixture.componentRef.setInput('initial', 'second');
    fixture.detectChanges();
    expect(fixture.componentInstance.control.value).toBe('saisie en cours');
  });
});
