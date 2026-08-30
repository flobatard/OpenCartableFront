import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { Spinner } from './spinner';

describe('Spinner', () => {
  let fixture: ComponentFixture<Spinner>;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Spinner, provideTranslocoTesting()],
    });
    fixture = TestBed.createComponent(Spinner);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('exposes role="status" for the loading announcement', () => {
    expect(host.getAttribute('role')).toBe('status');
    expect(host.getAttribute('aria-live')).toBe('polite');
  });

  it('applies the size class', () => {
    fixture.componentRef.setInput('size', 'lg');
    fixture.detectChanges();
    expect(host.classList).toContain('spinner--lg');
  });

  it('shows a custom label for screen readers', () => {
    fixture.componentRef.setInput('label', 'Chargement de l’éditeur');
    fixture.detectChanges();
    expect(host.querySelector('.sr-only')?.textContent).toContain('Chargement de l’éditeur');
  });

  it('falls back to the default translated label', () => {
    expect(host.querySelector('.sr-only')?.textContent?.trim().length).toBeGreaterThan(0);
  });
});
