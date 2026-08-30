import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResourcePickerDialog } from './resource-picker-dialog';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { CourseResource } from '../../core/resources/resource.model';

function resource(over: Partial<CourseResource> = {}): CourseResource {
  return {
    id: 'r-1',
    type: 'image',
    original_name: 'Photo.png',
    size: 1000,
    mime: 'image/png',
    status: 'available',
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

  it('lists the provided resources (name + type)', async () => {
    const fixture = await createComponent([
      resource({ id: 'a', original_name: 'Schéma.png', type: 'image' }),
      resource({ id: 'b', original_name: 'Énoncé.pdf', type: 'document', mime: 'application/pdf' }),
      resource({ id: 'c', original_name: 'Archive.zip', type: 'document', mime: 'application/zip' }),
    ]);
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.res-picker__item');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('Schéma.png');
    expect(items[0].textContent).toContain('Image');
    // Badge « PDF » dédié parmi les documents.
    expect(items[1].textContent).toContain('Énoncé.pdf');
    expect(items[1].textContent).toContain('PDF');
    expect(items[2].textContent).toContain('Archive.zip');
    expect(items[2].textContent).toContain('Document');
  });

  it('empty state when there are no resources', async () => {
    const fixture = await createComponent([]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.res-picker__item')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.res-picker__empty')).toBeTruthy();
  });

  it('clicking a resource emits (pick) then closes the dialog', async () => {
    const chosen = resource({ id: 'pick-me', original_name: 'Choix.png' });
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

  it('open() / close() drive the <dialog>', async () => {
    const fixture = await createComponent([]);
    const showModal = (dialog(fixture).showModal = vi.fn());
    const close = (dialog(fixture).close = vi.fn());

    fixture.componentInstance.open();
    fixture.componentInstance.close();

    expect(showModal).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('a backdrop click (the <dialog> itself) closes', async () => {
    const fixture = await createComponent([]);
    const close = (dialog(fixture).close = vi.fn());

    dialog(fixture).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(close).toHaveBeenCalledOnce();
  });
});
