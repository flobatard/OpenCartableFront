import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { Toast } from '../../core/notifications/notification.model';
import { Snackbar } from './snackbar';

describe('Snackbar', () => {
  let fixture: ComponentFixture<Snackbar>;
  let toasts: ReturnType<typeof signal<readonly Toast[]>>;
  let dismiss: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toasts = signal<readonly Toast[]>([]);
    dismiss = vi.fn();
    TestBed.configureTestingModule({
      imports: [Snackbar, provideTranslocoTesting()],
      providers: [
        { provide: NotificationService, useValue: { toasts: toasts.asReadonly(), dismiss } },
      ],
    });
    fixture = TestBed.createComponent(Snackbar);
    fixture.detectChanges();
  });

  it('ne rend aucun toast quand la file est vide', () => {
    expect(fixture.nativeElement.querySelectorAll('.snackbar__toast')).toHaveLength(0);
  });

  it('rend un toast et son message', () => {
    toasts.set([{ id: 1, message: 'Connexion impossible', severity: 'error' }]);
    fixture.detectChanges();
    const toast = fixture.nativeElement.querySelector('.snackbar__toast');
    expect(toast.textContent).toContain('Connexion impossible');
  });

  it('donne role="alert" à une erreur et role="status" au reste', () => {
    toasts.set([
      { id: 1, message: 'Err', severity: 'error' },
      { id: 2, message: 'Ok', severity: 'success' },
    ]);
    fixture.detectChanges();
    const els = fixture.nativeElement.querySelectorAll('.snackbar__toast');
    expect(els[0].getAttribute('role')).toBe('alert');
    expect(els[1].getAttribute('role')).toBe('status');
  });

  it('délègue la fermeture au service au clic', () => {
    toasts.set([{ id: 42, message: 'X', severity: 'info' }]);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.snackbar__close').click();
    expect(dismiss).toHaveBeenCalledWith(42);
  });
});
