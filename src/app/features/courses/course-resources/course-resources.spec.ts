import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CourseResources } from './course-resources';
import { ResourceService, UploadState } from '../../../core/resources/resource.service';
import { COURSE_RESOURCES_FIXTURE } from '../../../testing/resources.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';

describe('CourseResources', () => {
  const list = signal(COURSE_RESOURCES_FIXTURE);
  const listLoading = signal(false);
  const listError = signal(false);
  const uploadState = signal<UploadState>({ phase: 'idle', progress: 0 });
  const resourcesMock = {
    list,
    listLoading,
    listError,
    uploadState,
    loadList: vi.fn(),
    upload: vi.fn(),
    rename: vi.fn(),
    deleteResource: vi.fn(),
    getDownloadUrl: vi.fn(),
  };

  async function createComponent(): Promise<ComponentFixture<CourseResources>> {
    await TestBed.configureTestingModule({
      imports: [CourseResources, provideTranslocoTesting()],
      providers: [{ provide: ResourceService, useValue: resourcesMock }],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseResources);
    fixture.componentRef.setInput('courseId', 'course-1');
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<CourseResources>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(fixture: ComponentFixture<CourseResources>): HTMLElement[] {
    return Array.from(el(fixture).querySelectorAll('.course-resources__row'));
  }

  beforeEach(() => {
    list.set(COURSE_RESOURCES_FIXTURE);
    listLoading.set(false);
    listError.set(false);
    uploadState.set({ phase: 'idle', progress: 0 });
    vi.clearAllMocks();
    resourcesMock.upload.mockResolvedValue(COURSE_RESOURCES_FIXTURE[0]);
    resourcesMock.rename.mockResolvedValue(COURSE_RESOURCES_FIXTURE[0]);
    resourcesMock.deleteResource.mockResolvedValue(undefined);
    resourcesMock.getDownloadUrl.mockResolvedValue('https://s3.test/get/x');
  });

  it('charge la bibliothèque du cours à l’affichage', async () => {
    await createComponent();
    expect(resourcesMock.loadList).toHaveBeenCalledWith('course-1');
  });

  it('rend nom, type, taille et statut de chaque ressource', async () => {
    const fixture = await createComponent();

    const names = rows(fixture).map((r) =>
      r.querySelector('.course-resources__name')?.textContent?.trim(),
    );
    expect(names).toEqual(['schema-suites.pdf', 'illustration.png', 'capsule.mp4']);

    const types = rows(fixture).map((r) =>
      r.querySelector('.course-resources__type')?.textContent?.trim(),
    );
    expect(types).toEqual(['Document', 'Image', 'Vidéo']);

    // Taille lisible + mention « en attente » sur l'upload non confirmé.
    expect(rows(fixture)[0].textContent).toContain('245,0 ko');
    expect(rows(fixture)[2].textContent).toContain("En attente d'envoi");
    expect(rows(fixture)[2].classList.contains('course-resources__row--pending')).toBe(true);
  });

  it('le bouton d’upload délègue au service avec le fichier choisi', async () => {
    const fixture = await createComponent();
    const input = el(fixture).querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file] });

    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(resourcesMock.upload).toHaveBeenCalledWith('course-1', file);
    expect(input.value).toBe(''); // vidé pour permettre de re-choisir le même fichier
  });

  it('affiche la progression pendant l’upload et l’erreur en échec', async () => {
    const fixture = await createComponent();

    uploadState.set({ phase: 'uploading', progress: 42 });
    fixture.detectChanges();
    expect(el(fixture).querySelector('.course-resources__progress')?.textContent).toContain(
      '42',
    );

    uploadState.set({ phase: 'error', progress: 0 });
    fixture.detectChanges();
    expect(el(fixture).querySelector('.course-resources__upload-error')).toBeTruthy();
    // Le bouton reste actif : on peut retenter.
    expect(
      el(fixture).querySelector<HTMLButtonElement>('.course-resources__toolbar .btn')?.disabled,
    ).toBe(false);
  });

  it('renommage inline : Enregistrer PATCHe, Annuler restaure la ligne', async () => {
    const fixture = await createComponent();
    const renameBtn = rows(fixture)[0].querySelectorAll<HTMLButtonElement>('.btn')[0];
    renameBtn.click();
    fixture.detectChanges();

    fixture.componentInstance.renameControl.setValue('  schema-final.pdf ');
    el(fixture)
      .querySelector<HTMLButtonElement>('.course-resources__rename button[type="submit"]')!
      .click();
    await fixture.whenStable();

    // Le nom est trimé avant l'envoi.
    expect(resourcesMock.rename).toHaveBeenCalledWith(
      'course-1',
      'resource-1',
      'schema-final.pdf',
    );

    fixture.detectChanges();
    expect(el(fixture).querySelector('.course-resources__rename')).toBeNull(); // refermé
  });

  it('téléchargement : ouvre l’URL présignée ; désactivé sur une ressource en attente', async () => {
    const fixture = await createComponent();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const downloadBtn = (row: HTMLElement) => row.querySelectorAll<HTMLButtonElement>('.btn')[1];
    expect(downloadBtn(rows(fixture)[2]).disabled).toBe(true); // en_attente → 409 côté back

    downloadBtn(rows(fixture)[0]).click();
    await fixture.whenStable();

    expect(resourcesMock.getDownloadUrl).toHaveBeenCalledWith('course-1', 'resource-1');
    expect(open).toHaveBeenCalledWith('https://s3.test/get/x', '_blank', 'noopener');
    open.mockRestore();
  });

  it('suppression en deux temps, désarmée au blur, puis émet deleted', async () => {
    const fixture = await createComponent();
    const deleteBtn = () =>
      rows(fixture)[0].querySelector<HTMLButtonElement>('.course-resources__delete')!;
    let deletedEmitted = false;
    fixture.componentInstance.deleted.subscribe(() => (deletedEmitted = true));

    deleteBtn().click();
    fixture.detectChanges();
    expect(resourcesMock.deleteResource).not.toHaveBeenCalled();
    expect(deleteBtn().textContent).toContain('Confirmer la suppression');

    // Le blur désarme.
    deleteBtn().dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(deleteBtn().textContent).not.toContain('Confirmer');

    deleteBtn().click();
    fixture.detectChanges();
    deleteBtn().click();
    await fixture.whenStable();

    expect(resourcesMock.deleteResource).toHaveBeenCalledWith('course-1', 'resource-1');
    expect(deletedEmitted).toBe(true);
  });

  it('affiche l’état vide et l’erreur de chargement avec Réessayer', async () => {
    list.set([]);
    const fixture = await createComponent();
    expect(el(fixture).querySelector('.course-resources__empty')).toBeTruthy();

    listError.set(true);
    fixture.detectChanges();
    resourcesMock.loadList.mockClear();
    el(fixture).querySelector<HTMLButtonElement>('.course-resources__error .btn')!.click();
    expect(resourcesMock.loadList).toHaveBeenCalledWith('course-1');
  });
});
