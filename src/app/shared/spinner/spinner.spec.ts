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

  it('expose role="status" pour l’annonce du chargement', () => {
    expect(host.getAttribute('role')).toBe('status');
    expect(host.getAttribute('aria-live')).toBe('polite');
  });

  it('applique la classe de taille', () => {
    fixture.componentRef.setInput('size', 'lg');
    fixture.detectChanges();
    expect(host.classList).toContain('spinner--lg');
  });

  it('affiche un libellé personnalisé pour les lecteurs d’écran', () => {
    fixture.componentRef.setInput('label', 'Chargement de l’éditeur');
    fixture.detectChanges();
    expect(host.querySelector('.sr-only')?.textContent).toContain('Chargement de l’éditeur');
  });

  it('replie sur le libellé traduit par défaut', () => {
    expect(host.querySelector('.sr-only')?.textContent?.trim().length).toBeGreaterThan(0);
  });
});
