import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { CourseBlocks } from './course-blocks';
import { CourseBlock, CourseDetail } from '../../../core/courses/course.model';
import { CourseService } from '../../../core/courses/course.service';
import { CourseTransferService } from '../../../core/courses/course-transfer.service';
import { EducationLevelService } from '../../../core/education-levels/education-level.service';
import { ModuleService } from '../../../core/modules/module.service';
import { ResourceService } from '../../../core/resources/resource.service';
import { ShareLink } from '../../../core/share/share-link.model';
import { ShareLinkService } from '../../../core/share/share-link.service';
import { SubjectService } from '../../../core/subjects/subject.service';
import { UserProfileService } from '../../../core/users/user-profile.service';
import { COURSE_DETAIL_FIXTURE } from '../../../testing/courses.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { mockEducationLevelService, mockModuleService, mockResourceService, mockSubjectService } from '../../../testing/service-mocks';

describe('CourseBlocks', () => {
  const detail = signal<CourseDetail | null>(COURSE_DETAIL_FIXTURE);
  const detailLoading = signal(false);
  const detailError = signal(false);
  const coursesMock = {
    detail,
    detailLoading,
    detailError,
    loadDetail: vi.fn(),
    addBlock: vi.fn(),
    deleteBlock: vi.fn(),
    reorderBlocks: vi.fn(),
    deleteCourse: vi.fn(),
    updateCourse: vi.fn(),
  };
  const subjectsMock = mockSubjectService();
  const levelsMock = mockEducationLevelService();
  const resourcesMock = mockResourceService();
  const modulesMock = mockModuleService([
    { id: 'module-1', title: 'Quiz interactif', created_at: '2026-07-01', updated_at: '2026-07-01' },
  ]);
  const shareLinksMock = {
    list: signal<ShareLink[]>([]),
    listLoading: signal(false),
    listError: signal(false),
    loadList: vi.fn(),
    createLink: vi.fn(),
    revokeLink: vi.fn(),
  };
  const profileMock = {
    profile: signal(null),
    ensureLoaded: vi.fn().mockResolvedValue(null),
  };

  async function createComponent(tab?: string): Promise<ComponentFixture<CourseBlocks>> {
    await TestBed.configureTestingModule({
      imports: [CourseBlocks, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: CourseService, useValue: coursesMock },
        { provide: CourseTransferService, useValue: { exportCourse: vi.fn() } },
        { provide: SubjectService, useValue: subjectsMock },
        { provide: EducationLevelService, useValue: levelsMock },
        { provide: ResourceService, useValue: resourcesMock },
        { provide: ModuleService, useValue: modulesMock },
        { provide: ShareLinkService, useValue: shareLinksMock },
        { provide: UserProfileService, useValue: profileMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: 'course-1' }),
              queryParamMap: convertToParamMap(tab ? { tab } : {}),
            },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseBlocks);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<CourseBlocks>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(fixture: ComponentFixture<CourseBlocks>): HTMLElement[] {
    return Array.from(el(fixture).querySelectorAll('.course-blocks__row'));
  }

  function deleteButton(row: HTMLElement): HTMLButtonElement {
    return row.querySelector<HTMLButtonElement>('.course-blocks__delete')!;
  }

  beforeEach(() => {
    detail.set(COURSE_DETAIL_FIXTURE);
    detailLoading.set(false);
    detailError.set(false);
    vi.clearAllMocks();
    coursesMock.addBlock.mockResolvedValue(COURSE_DETAIL_FIXTURE.blocks[0]);
    coursesMock.deleteBlock.mockResolvedValue(undefined);
    coursesMock.reorderBlocks.mockResolvedValue(undefined);
    coursesMock.deleteCourse.mockResolvedValue(undefined);
  });

  it('loads the course from the route param and shows it with its badges', async () => {
    const fixture = await createComponent();

    expect(coursesMock.loadDetail).toHaveBeenCalledWith('course-1');
    expect(el(fixture).querySelector('.course-blocks__title')?.textContent).toContain(
      'Suites numériques',
    );
    const badges = Array.from(el(fixture).querySelectorAll('.course-blocks__badge')).map((b) =>
      b.textContent?.trim(),
    );
    expect(badges).toEqual(['Mathématiques', '6e']);
  });

  it('renders the blocks in order with their type, title and description', async () => {
    const fixture = await createComponent();
    const types = rows(fixture).map((r) =>
      r.querySelector('.course-blocks__type')?.textContent?.trim(),
    );
    const titles = rows(fixture).map((r) =>
      r.querySelector('.course-blocks__title-line')?.textContent?.trim(),
    );
    const descs = rows(fixture).map(
      (r) => r.querySelector('.course-blocks__desc')?.textContent?.trim() ?? null,
    );

    expect(types).toEqual(['Texte', 'Document', 'Exercice']);
    // block-1 a un titre + description ; block-2 (sans titre) replie sur « Bloc sans titre ».
    expect(titles).toEqual(['Le concept de suite', 'Bloc sans titre', 'Exercices d’application']);
    expect(descs).toEqual(['Définitions et premiers exemples.', null, null]);
  });

  it('offers “Modifier” on every block (all types editable)', async () => {
    const fixture = await createComponent();
    const [texteRow, documentRow] = rows(fixture);

    expect(
      texteRow.querySelector<HTMLAnchorElement>('.course-blocks__edit')?.getAttribute('href'),
    ).toBe('/fr/courses/course-1/blocks/block-1');
    expect(
      documentRow.querySelector<HTMLAnchorElement>('.course-blocks__edit')?.getAttribute('href'),
    ).toBe('/fr/courses/course-1/blocks/block-2');
  });

  it('disables move-up at the head of the list and move-down at the tail', async () => {
    const fixture = await createComponent();
    const firstRow = rows(fixture)[0];
    const lastRow = rows(fixture).at(-1)!;
    const [upFirst, downFirst] = Array.from(
      firstRow.querySelectorAll<HTMLButtonElement>('.course-blocks__move'),
    );
    const [upLast, downLast] = Array.from(
      lastRow.querySelectorAll<HTMLButtonElement>('.course-blocks__move'),
    );

    expect(upFirst.disabled).toBe(true);
    expect(downFirst.disabled).toBe(false);
    expect(upLast.disabled).toBe(false);
    expect(downLast.disabled).toBe(true);
  });

  it('moving a block down sends the full rewritten order', async () => {
    const fixture = await createComponent();
    const [, down] = Array.from(
      rows(fixture)[0].querySelectorAll<HTMLButtonElement>('.course-blocks__move'),
    );
    down.click();
    await fixture.whenStable();

    expect(coursesMock.reorderBlocks).toHaveBeenCalledWith('course-1', [
      'block-2',
      'block-1',
      'block-3',
    ]);
  });

  it('drag-and-drop reorders via previousIndex/currentIndex', async () => {
    const fixture = await createComponent();
    // jsdom ne peut pas simuler un vrai drag pointeur CDK : on appelle le handler
    // du drop avec un événement factice (previousIndex/currentIndex seulement).
    (
      fixture.componentInstance as unknown as { drop(e: CdkDragDrop<CourseBlock[]>): void }
    ).drop({ previousIndex: 0, currentIndex: 2 } as CdkDragDrop<CourseBlock[]>);
    await fixture.whenStable();

    expect(coursesMock.reorderBlocks).toHaveBeenCalledWith('course-1', [
      'block-2',
      'block-3',
      'block-1',
    ]);
  });

  it('the handle reorders via keyboard (End sends the block last)', async () => {
    const fixture = await createComponent();
    const grip = rows(fixture)[0].querySelector<HTMLElement>('.drag-handle')!;
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    await fixture.whenStable();

    expect(coursesMock.reorderBlocks).toHaveBeenCalledWith('course-1', [
      'block-2',
      'block-3',
      'block-1',
    ]);
  });

  it('the handle does not reorder out of bounds (first row moved up)', async () => {
    const fixture = await createComponent();
    const grip = rows(fixture)[0].querySelector<HTMLElement>('.drag-handle')!;
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    await fixture.whenStable();

    expect(coursesMock.reorderBlocks).not.toHaveBeenCalled();
  });

  it('renders a labelled drag-and-drop handle per row', async () => {
    const fixture = await createComponent();
    const grips = Array.from(el(fixture).querySelectorAll('.drag-handle'));
    expect(grips.length).toBe(3);
    expect(grips[0].getAttribute('aria-label')).toBe('Réordonner le bloc 1');
  });

  it('deletion asks for confirmation on the first click', async () => {
    const fixture = await createComponent();
    const button = deleteButton(rows(fixture)[0]);

    expect(button.textContent).toContain('Supprimer');
    button.click();
    await fixture.whenStable();

    expect(coursesMock.deleteBlock).not.toHaveBeenCalled();
    expect(deleteButton(rows(fixture)[0]).textContent).toContain('Confirmer la suppression');

    deleteButton(rows(fixture)[0]).click();
    await fixture.whenStable();
    expect(coursesMock.deleteBlock).toHaveBeenCalledWith('course-1', 'block-1');
  });

  it('leaving the armed button cancels the deletion', async () => {
    const fixture = await createComponent();
    const button = deleteButton(rows(fixture)[0]);
    button.click();
    await fixture.whenStable();

    button.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(deleteButton(rows(fixture)[0]).textContent).toContain('Supprimer');
    expect(coursesMock.deleteBlock).not.toHaveBeenCalled();
  });

  it('deleting the course asks for confirmation then deletes and returns to the list', async () => {
    const fixture = await createComponent();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const button = () =>
      el(fixture).querySelector<HTMLButtonElement>('.course-blocks__delete-course')!;

    expect(button().textContent).toContain('Supprimer ce cours');
    button().click();
    await fixture.whenStable();

    // Premier clic : arme seulement, aucune suppression.
    expect(coursesMock.deleteCourse).not.toHaveBeenCalled();
    expect(button().textContent).toContain('Confirmer la suppression du cours');

    button().click();
    await fixture.whenStable();
    expect(coursesMock.deleteCourse).toHaveBeenCalledWith('course-1');
    expect(navigate).toHaveBeenCalledWith(['/', 'fr', 'courses']);
  });

  it('leaving the armed button cancels the course deletion', async () => {
    const fixture = await createComponent();
    const button = el(fixture).querySelector<HTMLButtonElement>('.course-blocks__delete-course')!;
    button.click();
    await fixture.whenStable();
    expect(button.textContent).toContain('Confirmer la suppression du cours');

    button.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(
      el(fixture).querySelector('.course-blocks__delete-course')?.textContent,
    ).toContain('Supprimer ce cours');
    expect(coursesMock.deleteCourse).not.toHaveBeenCalled();
  });

  it('offers the four block types, all enabled, and opens the dialog', async () => {
    const fixture = await createComponent();
    const addButtons = Array.from(
      el(fixture).querySelectorAll<HTMLButtonElement>('.course-blocks__add-buttons .btn'),
    );

    expect(addButtons.map((b) => b.textContent?.trim())).toEqual([
      'Texte',
      'Exercice',
      'Document',
      'Module interactif',
    ]);
    expect(addButtons.every((b) => !b.disabled)).toBe(true);
    // Plus de bouton « Ressource » désactivé ni de mention « bientôt ».
    expect(el(fixture).querySelector('.course-blocks__add-hint')).toBeNull();

    const showModal = vi.spyOn(el(fixture).querySelector('dialog')!, 'showModal');
    addButtons[0].click(); // Texte → ouvre la modale, ne crée pas directement
    expect(showModal).toHaveBeenCalledOnce();
    expect(coursesMock.addBlock).not.toHaveBeenCalled();
  });

  it('the header Edit button opens the course dialog prefilled with title and description', async () => {
    const fixture = await createComponent();
    const editDialog = el(fixture).querySelector('.course-edit-dialog') as HTMLDialogElement;
    const showModal = vi.spyOn(editDialog, 'showModal').mockImplementation(() => {});

    el(fixture).querySelector<HTMLButtonElement>('.course-blocks__edit-course')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(showModal).toHaveBeenCalledOnce();
    expect(
      editDialog.querySelector<HTMLInputElement>('[formControlName="title"]')!.value,
    ).toBe(COURSE_DETAIL_FIXTURE.title);
    expect(
      editDialog.querySelector<HTMLTextAreaElement>('[formControlName="description"]')!.value,
    ).toBe(COURSE_DETAIL_FIXTURE.description ?? '');
  });

  it('saving the course dialog PATCHes the course then closes the dialog', async () => {
    const fixture = await createComponent();
    coursesMock.updateCourse.mockResolvedValue({
      id: 'course-1',
      title: 'Suites et limites',
      description: null,
      subject_ids: COURSE_DETAIL_FIXTURE.subject_ids,
      education_level_ids: COURSE_DETAIL_FIXTURE.education_level_ids,
      updated_at: '2026-07-08T11:00:00Z',
    });
    const editDialog = el(fixture).querySelector('.course-edit-dialog') as HTMLDialogElement;
    vi.spyOn(editDialog, 'showModal').mockImplementation(() => {});
    const close = vi.spyOn(editDialog, 'close').mockImplementation(() => {});

    el(fixture).querySelector<HTMLButtonElement>('.course-blocks__edit-course')!.click();
    fixture.detectChanges();

    const title = editDialog.querySelector<HTMLInputElement>('[formControlName="title"]')!;
    title.value = '  Suites et limites  ';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    editDialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();

    expect(coursesMock.updateCourse).toHaveBeenCalledWith('course-1', {
      title: 'Suites et limites',
      description: COURSE_DETAIL_FIXTURE.description,
      // Classement inchangé, renvoyé tel quel (sémantique de remplacement).
      subject_ids: COURSE_DETAIL_FIXTURE.subject_ids,
      education_level_ids: COURSE_DETAIL_FIXTURE.education_level_ids,
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('confirming the dialog creates the block with its meta then redirects to the editor', async () => {
    const fixture = await createComponent();
    coursesMock.addBlock.mockResolvedValue({ ...COURSE_DETAIL_FIXTURE.blocks[0], id: 'block-9' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    // Ouvre la modale pour « Document ».
    const addButtons = Array.from(
      el(fixture).querySelectorAll<HTMLButtonElement>('.course-blocks__add-buttons .btn'),
    );
    addButtons[2].click();
    fixture.detectChanges();

    // Saisit un titre puis valide.
    const title = el(fixture).querySelector<HTMLInputElement>(
      '.block-dialog [formControlName="title"]',
    )!;
    title.value = 'Le schéma';
    title.dispatchEvent(new Event('input'));
    el(fixture).querySelector<HTMLButtonElement>('.block-dialog button[type="submit"]')!.click();
    await fixture.whenStable();

    expect(coursesMock.addBlock).toHaveBeenCalledWith('course-1', 'document', {
      title: 'Le schéma',
      description: null,
    });
    expect(navigate).toHaveBeenCalledWith(['/', 'fr', 'courses', 'course-1', 'blocks', 'block-9']);
  });

  it('shows the Blocks tab by default and switches to Resources', async () => {
    const fixture = await createComponent();
    const tabs = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((t) => t.textContent?.trim())).toEqual([
      'Blocs',
      'Ressources',
      'Modules',
      'Aperçu',
      'Partage',
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(el(fixture).querySelector('app-course-resources')).toBeNull();

    tabs[1].click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(el(fixture).querySelector('app-course-resources')).toBeTruthy();
    expect(resourcesMock.loadList).toHaveBeenCalledWith('course-1');
    // La liste des blocs a laissé place au panneau ressources.
    expect(el(fixture).querySelector('.course-blocks__list')).toBeNull();
  });

  it('?tab=resources opens the Resources tab directly (deep-link)', async () => {
    const fixture = await createComponent('resources');
    expect(el(fixture).querySelector('app-course-resources')).toBeTruthy();
    expect(
      el(fixture)
        .querySelector<HTMLButtonElement>('[role="tab"]:nth-of-type(2)')
        ?.getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('switching to Preview: mounts app-course-preview and serializes ?tab=preview', async () => {
    const fixture = await createComponent();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const tabs = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('[role="tab"]'));

    tabs[3].click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(tabs[3].getAttribute('aria-selected')).toBe('true');
    expect(el(fixture).querySelector('app-course-preview')).toBeTruthy();
    expect(el(fixture).querySelector('app-course-resources')).toBeNull();
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { tab: 'preview' },
      replaceUrl: true,
    });
  });

  it('?tab=preview opens the Preview tab directly (deep-link)', async () => {
    const fixture = await createComponent('preview');
    expect(el(fixture).querySelector('app-course-preview')).toBeTruthy();
    const tabs = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs[3].getAttribute('aria-selected')).toBe('true');
  });

  it('?tab=modules opens the Modules tab directly (deep-link)', async () => {
    const fixture = await createComponent('modules');
    expect(el(fixture).querySelector('app-course-modules')).toBeTruthy();
    expect(modulesMock.loadList).toHaveBeenCalledWith('course-1');
    const tabs = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
  });

  it('arrow keys cycle through the five tabs (APG tabs)', async () => {
    const fixture = await createComponent();
    const tablist = el(fixture).querySelector('[role="tablist"]')!;
    const tabs = () => Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('[role="tab"]'));

    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');

    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true');

    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[3].getAttribute('aria-selected')).toBe('true');

    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[4].getAttribute('aria-selected')).toBe('true');

    // Cycle : depuis Partage, flèche droite revient à Blocs.
    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('a module deletion reloads the course detail (module blocks cascade-deleted)', async () => {
    const fixture = await createComponent('modules');
    coursesMock.loadDetail.mockClear();

    const modules = el(fixture).querySelector('app-course-modules')!;
    modulesMock.deleteModule.mockResolvedValue(undefined);
    modules.querySelectorAll<HTMLButtonElement>('.course-modules__delete')[0].click(); // arme
    fixture.detectChanges();
    modules.querySelectorAll<HTMLButtonElement>('.course-modules__delete')[0].click();
    await fixture.whenStable();

    expect(coursesMock.loadDetail).toHaveBeenCalledWith('course-1');
  });

  it('a resource deletion reloads the course detail (document blocks cascade-deleted)', async () => {
    const fixture = await createComponent('resources');
    coursesMock.loadDetail.mockClear();

    const resources = el(fixture).querySelector('app-course-resources')!;
    // L'output (deleted) remonte du composant enfant après un DELETE réussi.
    resourcesMock.deleteResource.mockResolvedValue(undefined);
    const deleteBtn = resources.querySelectorAll<HTMLButtonElement>('.course-resources__delete');
    deleteBtn[0].click(); // arme
    fixture.detectChanges();
    resources.querySelectorAll<HTMLButtonElement>('.course-resources__delete')[0].click();
    await fixture.whenStable();

    expect(coursesMock.loadDetail).toHaveBeenCalledWith('course-1');
  });

  it('without blocks, invites to add the first one', async () => {
    detail.set({ ...COURSE_DETAIL_FIXTURE, blocks: [] });
    const fixture = await createComponent();
    expect(el(fixture).querySelector('.course-blocks__empty')?.textContent).toContain(
      'Ajoute ton premier bloc',
    );
  });

  it('shows the load error and retries via the retry button', async () => {
    detail.set(null);
    detailError.set(true);
    const fixture = await createComponent();
    const retry = el(fixture).querySelector<HTMLButtonElement>('.course-blocks__error .btn');
    expect(retry).toBeTruthy();

    coursesMock.loadDetail.mockClear();
    retry?.click();
    expect(coursesMock.loadDetail).toHaveBeenCalledWith('course-1');
  });
});
