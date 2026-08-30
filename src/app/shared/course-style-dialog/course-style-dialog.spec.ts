import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CourseStyleService } from '../../core/courses/course-style.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { CourseStyleDialog } from './course-style-dialog';

/**
 * jsdom n'implémente pas la vraie modalité de <dialog> (showModal/close) : on
 * espionne les méthodes natives. Le service (racine, sans dépendance) est réel —
 * on vérifie que les contrôles le pilotent.
 */
describe('CourseStyleDialog', () => {
  async function createComponent(): Promise<ComponentFixture<CourseStyleDialog>> {
    await TestBed.configureTestingModule({
      imports: [CourseStyleDialog, provideTranslocoTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseStyleDialog);
    await fixture.whenStable();
    return fixture;
  }

  function dialog(fixture: ComponentFixture<CourseStyleDialog>): HTMLDialogElement {
    return (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
  }

  it('open() opens the dialog, close() closes it', async () => {
    const fixture = await createComponent();
    const showModal = (dialog(fixture).showModal = vi.fn());
    const close = (dialog(fixture).close = vi.fn());

    fixture.componentInstance.open();
    expect(showModal).toHaveBeenCalledOnce();

    fixture.componentInstance.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('a backdrop click closes, a child click does not', async () => {
    const fixture = await createComponent();
    const close = (dialog(fixture).close = vi.fn());

    fixture.nativeElement
      .querySelector('.course-style__title')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(close).not.toHaveBeenCalled();

    dialog(fixture).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('moving the size slider updates the service', async () => {
    const fixture = await createComponent();
    const service = TestBed.inject(CourseStyleService);
    // Le premier <input type=range> est la taille du texte.
    const range = fixture.nativeElement.querySelector('input[type="range"]') as HTMLInputElement;

    range.value = '20';
    range.dispatchEvent(new Event('input', { bubbles: true }));

    expect(service.settings().fontSizePx).toBe(20);
  });

  it('clicking “serif” switches the service font', async () => {
    const fixture = await createComponent();
    const service = TestBed.inject(CourseStyleService);
    const pills = fixture.nativeElement.querySelectorAll('.course-style__choices .pill');

    (pills[1] as HTMLButtonElement).click(); // seconde pilule = serif
    expect(service.settings().font).toBe('serif');
  });

  it('the Reset button restores the defaults', async () => {
    const fixture = await createComponent();
    const service = TestBed.inject(CourseStyleService);
    service.update({ fontSizePx: 22, font: 'serif' });
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.course-style__foot .btn') as HTMLButtonElement).click();

    expect(service.settings().fontSizePx).toBe(16);
    expect(service.settings().font).toBe('sans');
  });
});
