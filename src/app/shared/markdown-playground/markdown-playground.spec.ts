import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { ResourceService } from '../../core/resources/resource.service';
import { MarkdownPlayground } from './markdown-playground';

/** MarkdownView (réel) injecte ResourceService : mock signaux, jamais de HTTP. */
const resourcesMock = {
  list: signal([]),
  listLoading: signal(false),
  loadList: vi.fn(),
  getDownloadUrl: vi.fn(),
};

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

  it('pose l’exemple initial dans le contrôle ET l’aperçu, sans attendre le debounce', async () => {
    const fixture = createPlayground('## Bonjour');
    await fixture.whenStable();
    const component = fixture.componentInstance;
    expect(component.control.value).toBe('## Bonjour');
    expect(fixture.nativeElement.querySelector('.course-content')?.innerHTML).toContain('<h2>');
  });

  it('répercute la frappe sur l’aperçu après debounce (jsdom pilote le contrôle)', async () => {
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

  it('ne réinitialise pas la saisie si l’input initial change (lu une seule fois)', async () => {
    const fixture = createPlayground('premier');
    fixture.componentInstance.control.setValue('saisie en cours');
    fixture.componentRef.setInput('initial', 'second');
    fixture.detectChanges();
    expect(fixture.componentInstance.control.value).toBe('saisie en cours');
  });
});
