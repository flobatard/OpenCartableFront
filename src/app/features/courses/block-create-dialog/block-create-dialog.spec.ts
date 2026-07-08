import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BlockCreateDialog } from './block-create-dialog';
import { CreatableBlockType } from '../../../core/courses/course.model';
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

  it('open(type) ouvre la modale, fixe le type et réinitialise le formulaire', async () => {
    const fixture = await createComponent();
    const showModal = (dialog(fixture).showModal = vi.fn());

    type(field(fixture, 'titre'), 'Ancienne saisie');
    fixture.componentInstance.open('lien');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(showModal).toHaveBeenCalledOnce();
    expect(field(fixture, 'titre').value).toBe(''); // réinitialisé à l'ouverture
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Lien'); // titre = type
  });

  it('submit émet create avec le type et le méta trimé puis ferme', async () => {
    const fixture = await createComponent();
    dialog(fixture).showModal = vi.fn();
    const close = (dialog(fixture).close = vi.fn());

    fixture.componentInstance.open('exercice');
    fixture.detectChanges();
    type(field(fixture, 'titre'), '  Mon titre  ');
    type(field(fixture, 'description'), 'Ma description');

    let emitted: { type: CreatableBlockType; meta: unknown } | undefined;
    fixture.componentInstance.create.subscribe((e) => (emitted = e));

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[type="submit"]')!
      .click();
    await fixture.whenStable();

    expect(emitted).toEqual({
      type: 'exercice',
      meta: { titre: 'Mon titre', description: 'Ma description' },
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('crée sans saisie (méta null) reste possible', async () => {
    const fixture = await createComponent();
    dialog(fixture).showModal = vi.fn();
    dialog(fixture).close = vi.fn();
    fixture.componentInstance.open('texte');
    fixture.detectChanges();

    let emitted: { type: CreatableBlockType; meta: unknown } | undefined;
    fixture.componentInstance.create.subscribe((e) => (emitted = e));

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[type="submit"]')!
      .click();
    await fixture.whenStable();

    expect(emitted).toEqual({ type: 'texte', meta: { titre: null, description: null } });
  });

  it('un clic sur le fond (la <dialog> elle-même) ferme', async () => {
    const fixture = await createComponent();
    const close = (dialog(fixture).close = vi.fn());

    dialog(fixture).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(close).toHaveBeenCalledOnce();
  });
});
