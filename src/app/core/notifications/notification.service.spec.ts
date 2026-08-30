import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [NotificationService] });
    service = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('stacks a toast with an id and a severity', () => {
    service.error('Boom');
    const toasts = service.toasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ message: 'Boom', severity: 'error' });
    expect(typeof toasts[0].id).toBe('number');
  });

  it('assigns distinct ids and preserves arrival order', () => {
    service.info('A');
    service.success('B');
    const [first, second] = service.toasts();
    expect(first.message).toBe('A');
    expect(second.message).toBe('B');
    expect(first.id).not.toBe(second.id);
  });

  it('deduplicates an identical toast already visible', () => {
    service.error('Même message');
    service.error('Même message');
    expect(service.toasts()).toHaveLength(1);
  });

  it('is not deduplicated when the severity differs', () => {
    service.error('X');
    service.info('X');
    expect(service.toasts()).toHaveLength(2);
  });

  it('auto-dismisses the toast after its duration', () => {
    service.success('Bref');
    expect(service.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(service.toasts()).toHaveLength(0);
  });

  it('dismiss removes the toast and cancels its timer', () => {
    service.error('Erreur');
    const id = service.toasts()[0].id;
    service.dismiss(id);
    expect(service.toasts()).toHaveLength(0);
    // Le timer étant annulé, avancer le temps ne provoque aucune erreur.
    vi.advanceTimersByTime(10000);
    expect(service.toasts()).toHaveLength(0);
  });

  it('after auto-dismissal, an identical message can be emitted again', () => {
    service.error('Répétable');
    vi.advanceTimersByTime(9000);
    expect(service.toasts()).toHaveLength(0);
    service.error('Répétable');
    expect(service.toasts()).toHaveLength(1);
  });
});
