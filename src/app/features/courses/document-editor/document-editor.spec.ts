import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocumentEditor } from './document-editor';
import { DocumentContentPayload } from '../../../core/courses/course.model';
import { ResourceService } from '../../../core/resources/resource.service';
import { COURSE_RESOURCES_FIXTURE } from '../../../testing/resources.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';

describe('DocumentEditor', () => {
  const AVAILABLE = COURSE_RESOURCES_FIXTURE.filter((r) => r.status === 'available');
  // L'aperçu embarqué (CoursePreviewDocument) présigne via le résolveur prof.
  const getDownloadUrl = vi.fn().mockResolvedValue('https://s3.example/presigned');

  async function createComponent(
    inputs: {
      initial?: Record<string, unknown>;
      resourceId?: string | null;
      resources?: typeof AVAILABLE;
    } = {},
  ): Promise<ComponentFixture<DocumentEditor>> {
    await TestBed.configureTestingModule({
      imports: [DocumentEditor, provideTranslocoTesting()],
      providers: [{ provide: ResourceService, useValue: { getDownloadUrl } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(DocumentEditor);
    fixture.componentRef.setInput('courseId', 'course-1');
    fixture.componentRef.setInput(
      'initial',
      inputs.initial ?? { caption: 'Schéma', display: 'download' },
    );
    // `??` piègerait le cas `resourceId: null` (bloc sans ressource) : on ne
    // replie sur resource-1 que si la clé est absente.
    fixture.componentRef.setInput(
      'resourceId',
      inputs.resourceId === undefined ? 'resource-1' : inputs.resourceId,
    );
    fixture.componentRef.setInput('resources', inputs.resources ?? AVAILABLE);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<DocumentEditor>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => getDownloadUrl.mockClear());

  it('initializes the form from [initial] without emitting, and the select from [resourceId]', async () => {
    const emissions: DocumentContentPayload[] = [];
    const fixture = await createComponent();
    fixture.componentInstance.contentChange.subscribe((p) => emissions.push(p));

    expect(fixture.componentInstance.form.getRawValue()).toEqual({
      caption: 'Schéma',
      display: 'download',
    });
    expect(fixture.componentInstance.resourceControl.value).toBe('resource-1');
    expect(emissions).toEqual([]); // l'init ne déclenche pas l'autosave du parent
  });

  it('emits contentChange on every keystroke (empty caption → null)', async () => {
    const fixture = await createComponent();
    const emissions: DocumentContentPayload[] = [];
    fixture.componentInstance.contentChange.subscribe((p) => emissions.push(p));

    fixture.componentInstance.form.controls.caption.setValue('Nouvelle légende');
    fixture.componentInstance.form.controls.caption.setValue('   ');

    expect(emissions).toEqual([
      { caption: 'Nouvelle légende', display: 'download' },
      { caption: null, display: 'download' },
    ]);
  });

  it('emits resourcePick when a resource is chosen, null for the empty option', async () => {
    const fixture = await createComponent();
    const picks: (string | null)[] = [];
    fixture.componentInstance.resourcePick.subscribe((id) => picks.push(id));

    fixture.componentInstance.resourceControl.setValue('resource-2');
    fixture.componentInstance.resourceControl.setValue('');

    expect(picks).toEqual(['resource-2', null]);
  });

  it('a resourceId missing from the list falls back to the empty option (deleted resource)', async () => {
    const fixture = await createComponent({ resourceId: 'resource-fantome' });
    expect(fixture.componentInstance.resourceControl.value).toBe('');
  });

  it('resetResource restores the select without emitting (revert after a failed PATCH)', async () => {
    const fixture = await createComponent();
    const picks: (string | null)[] = [];
    fixture.componentInstance.resourcePick.subscribe((id) => picks.push(id));

    fixture.componentInstance.resourceControl.setValue('resource-2');
    fixture.componentInstance.resetResource('resource-1');

    expect(fixture.componentInstance.resourceControl.value).toBe('resource-1');
    expect(picks).toEqual(['resource-2']); // le revert n'a rien émis
  });

  it('without an available resource, a message points to the Resources tab', async () => {
    const fixture = await createComponent({ resources: [], resourceId: null });
    expect(el(fixture).querySelector('.document-editor__hint')?.textContent).toContain(
      'onglet Ressources',
    );
  });

  it('mounts the initial resource preview with the block’s editorial (seed)', async () => {
    // [initial] est en `download` : l'aperçu du PDF doit montrer la CARTE
    // — preuve que le seed de l'éditorial traverse les patchs `emitEvent: false`
    // (sinon l'aperçu resterait sur le défaut `inline` → iframe).
    const fixture = await createComponent();
    const preview = el(fixture).querySelector('app-course-preview-document');
    expect(preview).toBeTruthy();
    expect(preview!.querySelector('.course-preview-document__card')?.textContent).toContain(
      'schema-suites.pdf',
    );
    expect(preview!.querySelector('iframe')).toBeNull();
  });

  it('the preview follows the select’s resource choice (optimistic, before the PATCH)', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.resourceControl.setValue('resource-2');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getDownloadUrl).toHaveBeenCalledWith('course-1', 'resource-2');
    expect(el(fixture).querySelector('img.course-preview-document__media')).toBeTruthy();
  });

  it('the preview follows caption typing (live figcaption)', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.form.controls.caption.setValue('Légende live');
    fixture.detectChanges();

    expect(el(fixture).querySelector('.course-preview-document__caption')?.textContent).toContain(
      'Légende live',
    );
  });

  it('without a selected resource, no preview (never the “not found” notice)', async () => {
    const fixture = await createComponent({ resourceId: null });
    expect(el(fixture).querySelector('app-course-preview-document')).toBeNull();
  });

  it('resetResource brings the preview back to the block’s resource', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.resourceControl.setValue('resource-2');
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.resetResource('resource-1');
    fixture.detectChanges();

    expect(
      el(fixture).querySelector('.course-preview-document__card')?.textContent,
    ).toContain('schema-suites.pdf');
  });
});
