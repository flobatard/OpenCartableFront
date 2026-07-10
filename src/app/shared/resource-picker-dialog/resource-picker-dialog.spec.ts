import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResourcePickerDialog } from './resource-picker-dialog';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { CourseResource } from '../../core/resources/resource.model';

function resource(over: Partial<CourseResource> = {}): CourseResource {
  return {
    id: 'r-1',
    type: 'image',
    nom_original: 'Photo.png',
    taille: 1000,
    mime: 'image/png',
    statut: 'disponible',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('ResourcePickerDialog', () => {
  async function createComponent(
    resources: CourseResource[],
  ): Promise<ComponentFixture<ResourcePickerDialog>> {
    await TestBed.configureTestingModule({
      imports: [ResourcePickerDialog, provideTranslocoTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(ResourcePickerDialog);
    fixture.componentRef.setInput('resources', resources);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function dialog(fixture: ComponentFixture<ResourcePickerDialog>): HTMLDialogElement {
    return (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
  }

  it('liste les ressources fournies (nom + type)', async () => {
    const fixture = await createComponent([
      resource({ id: 'a', nom_original: 'Schéma.png', type: 'image' }),
      resource({ id: 'b', nom_original: 'Énoncé.pdf', type: 'document' }),
    ]);
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.res-picker__item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Schéma.png');
    expect(items[0].textContent).toContain('Image');
    expect(items[1].textContent).toContain('Énoncé.pdf');
    expect(items[1].textContent).toContain('Document');
  });

  it('état vide quand aucune ressource', async () => {
    const fixture = await createComponent([]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.res-picker__item')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.res-picker__empty')).toBeTruthy();
  });

  it('un clic sur une ressource émet (pick) puis ferme la modale', async () => {
    const chosen = resource({ id: 'pick-me', nom_original: 'Choix.png' });
    const fixture = await createComponent([chosen]);
    const close = (dialog(fixture).close = vi.fn());
    let picked: CourseResource | undefined;
    fixture.componentInstance.pick.subscribe((r) => (picked = r));

    (fixture.nativeElement as HTMLElement)
      .querySelector('.res-picker__item')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(picked).toBe(chosen);
    expect(close).toHaveBeenCalledOnce();
  });

  it('open() / close() pilotent le <dialog>', async () => {
    const fixture = await createComponent([]);
    const showModal = (dialog(fixture).showModal = vi.fn());
    const close = (dialog(fixture).close = vi.fn());

    fixture.componentInstance.open();
    fixture.componentInstance.close();

    expect(showModal).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('un clic sur le fond (la <dialog> elle-même) ferme', async () => {
    const fixture = await createComponent([]);
    const close = (dialog(fixture).close = vi.fn());

    dialog(fixture).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(close).toHaveBeenCalledOnce();
  });
});
