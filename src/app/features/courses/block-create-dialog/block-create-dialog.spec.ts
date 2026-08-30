import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BlockCreateDialog } from './block-create-dialog';
import { BlockType } from '../../../core/courses/course.model';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';

/**
 * jsdom n'implémente pas la vraie modalité de <dialog> ; on pilote la modale via
 * ses méthodes publiques `open()` / `close()` et on saisit dans les champs natifs.
 */
describe('BlockCreateDialog', () => {
  async function createComponent(): Promise<ComponentFixture<BlockCreateDialog>> {
    await TestBed.configureTestingModule({
      imports: [BlockCreateDialog, provideTranslocoTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(BlockCreateDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function dialog(fixture: ComponentFixture<BlockCreateDialog>): HTMLDialogElement {
    return (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
  }

  function field(
    fixture: ComponentFixture<BlockCreateDialog>,
    name: string,
  ): HTMLInputElement & HTMLTextAreaElement {
    return (fixture.nativeElement as HTMLElement).querySelector(`[formControlName="${name}"]`)!;
  }

  function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    el.value = value;
    el.dispatchEvent(new Event('input'));
  }

  it('open(type) opens the dialog, sets the type and resets the form', async () => {
    const fixture = await createComponent();
    const showModal = (dialog(fixture).showModal = vi.fn());

    type(field(fixture, 'title'), 'Ancienne saisie');
    fixture.componentInstance.open('document');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(showModal).toHaveBeenCalledOnce();
    expect(field(fixture, 'title').value).toBe(''); // réinitialisé à l'ouverture
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Document'); // titre = type
  });

  it('submit emits create with the type and the trimmed meta, then closes', async () => {
    const fixture = await createComponent();
    dialog(fixture).showModal = vi.fn();
    const close = (dialog(fixture).close = vi.fn());

    fixture.componentInstance.open('exercise');
    fixture.detectChanges();
    type(field(fixture, 'title'), '  Mon titre  ');
    type(field(fixture, 'description'), 'Ma description');

    let emitted: { type: BlockType; meta: unknown } | undefined;
    fixture.componentInstance.create.subscribe((e) => (emitted = e));

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[type="submit"]')!
      .click();
    await fixture.whenStable();

    expect(emitted).toEqual({
      type: 'exercise',
      meta: { title: 'Mon titre', description: 'Ma description' },
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('creating without input (null meta) stays possible', async () => {
    const fixture = await createComponent();
    dialog(fixture).showModal = vi.fn();
    dialog(fixture).close = vi.fn();
    fixture.componentInstance.open('text');
    fixture.detectChanges();

    let emitted: { type: BlockType; meta: unknown } | undefined;
    fixture.componentInstance.create.subscribe((e) => (emitted = e));

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[type="submit"]')!
      .click();
    await fixture.whenStable();

    expect(emitted).toEqual({ type: 'text', meta: { title: null, description: null } });
  });

  it('a backdrop click (the <dialog> itself) closes', async () => {
    const fixture = await createComponent();
    const close = (dialog(fixture).close = vi.fn());

    dialog(fixture).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(close).toHaveBeenCalledOnce();
  });
});
