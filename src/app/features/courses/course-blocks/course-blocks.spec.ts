import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { CourseBlocks } from './course-blocks';
import { CourseDetail } from '../../../core/courses/course.model';
import { CourseService } from '../../../core/courses/course.service';
import { EducationLevelService } from '../../../core/education-levels/education-level.service';
import { SubjectService } from '../../../core/subjects/subject.service';
import { COURSE_DETAIL_FIXTURE } from '../../../testing/courses.fixture';
import { EDUCATION_LEVELS_FIXTURE } from '../../../testing/education-levels.fixture';
import { SUBJECTS_FIXTURE } from '../../../testing/subjects.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';

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
  };
  const subjectsMock = {
    tree: signal(SUBJECTS_FIXTURE),
    loading: signal(false),
    error: signal(false),
    load: vi.fn(),
    reload: vi.fn(),
  };
  const levelsMock = {
    tree: signal(EDUCATION_LEVELS_FIXTURE),
    loading: signal(false),
    error: signal(false),
    load: vi.fn(),
    reload: vi.fn(),
  };

  async function createComponent(): Promise<ComponentFixture<CourseBlocks>> {
    await TestBed.configureTestingModule({
      imports: [CourseBlocks, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: CourseService, useValue: coursesMock },
        { provide: SubjectService, useValue: subjectsMock },
        { provide: EducationLevelService, useValue: levelsMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'course-1' }) } },
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

  it('charge le cours du paramètre de route et l’affiche avec ses badges', async () => {
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

  it('rend les blocs dans l’ordre avec leur type, titre et description', async () => {
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

    expect(types).toEqual(['Texte', 'Lien', 'Exercice']);
    // block-1 a un titre + description ; block-2 (sans titre) replie sur « Bloc sans titre ».
    expect(titles).toEqual(['Le concept de suite', 'Bloc sans titre', 'Exercices d’application']);
    expect(descs).toEqual(['Définitions et premiers exemples.', null, null]);
  });

  it('propose « Modifier » sur tous les blocs (tous types éditables)', async () => {
    const fixture = await createComponent();
    const [texteRow, lienRow] = rows(fixture);

    expect(
      texteRow.querySelector<HTMLAnchorElement>('.course-blocks__edit')?.getAttribute('href'),
    ).toBe('/fr/courses/course-1/blocks/block-1');
    expect(
      lienRow.querySelector<HTMLAnchorElement>('.course-blocks__edit')?.getAttribute('href'),
    ).toBe('/fr/courses/course-1/blocks/block-2');
  });

  it('désactive monter en tête de liste et descendre en queue', async () => {
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

  it('descendre un bloc envoie l’ordre complet réécrit', async () => {
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

  it('la suppression demande une confirmation au premier clic', async () => {
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

  it('quitter le bouton armé annule la suppression', async () => {
    const fixture = await createComponent();
    const button = deleteButton(rows(fixture)[0]);
    button.click();
    await fixture.whenStable();

    button.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(deleteButton(rows(fixture)[0]).textContent).toContain('Supprimer');
    expect(coursesMock.deleteBlock).not.toHaveBeenCalled();
  });

  it('supprimer le cours demande confirmation puis supprime et revient à la liste', async () => {
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

  it('quitter le bouton armé annule la suppression du cours', async () => {
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

  it('les boutons de type ouvrent la modale ; « ressource » est désactivé avec sa mention', async () => {
    const fixture = await createComponent();
    const addButtons = Array.from(
      el(fixture).querySelectorAll<HTMLButtonElement>('.course-blocks__add-buttons .btn'),
    );

    expect(addButtons.map((b) => b.textContent?.trim())).toEqual([
      'Texte',
      'Exercice',
      'Lien',
      'Ressource',
    ]);
    expect(addButtons[3].disabled).toBe(true);
    expect(el(fixture).querySelector('.course-blocks__add-hint')?.textContent).toContain(
      'Bientôt disponible',
    );

    const showModal = vi.spyOn(el(fixture).querySelector('dialog')!, 'showModal');
    addButtons[0].click(); // Texte → ouvre la modale, ne crée pas directement
    expect(showModal).toHaveBeenCalledOnce();
    expect(coursesMock.addBlock).not.toHaveBeenCalled();
  });

  it('valider la modale crée le bloc avec son méta puis redirige vers l’éditeur', async () => {
    const fixture = await createComponent();
    coursesMock.addBlock.mockResolvedValue({ ...COURSE_DETAIL_FIXTURE.blocks[0], id: 'block-9' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    // Ouvre la modale pour « Lien ».
    const addButtons = Array.from(
      el(fixture).querySelectorAll<HTMLButtonElement>('.course-blocks__add-buttons .btn'),
    );
    addButtons[2].click();
    fixture.detectChanges();

    // Saisit un titre puis valide.
    const titre = el(fixture).querySelector<HTMLInputElement>(
      '.block-dialog [formControlName="titre"]',
    )!;
    titre.value = 'Vidéo';
    titre.dispatchEvent(new Event('input'));
    el(fixture).querySelector<HTMLButtonElement>('.block-dialog button[type="submit"]')!.click();
    await fixture.whenStable();

    expect(coursesMock.addBlock).toHaveBeenCalledWith('course-1', 'lien', {
      titre: 'Vidéo',
      description: null,
    });
    expect(navigate).toHaveBeenCalledWith(['/', 'fr', 'courses', 'course-1', 'blocks', 'block-9']);
  });

  it('sans bloc, invite à ajouter le premier', async () => {
    detail.set({ ...COURSE_DETAIL_FIXTURE, blocks: [] });
    const fixture = await createComponent();
    expect(el(fixture).querySelector('.course-blocks__empty')?.textContent).toContain(
      'Ajoute ton premier bloc',
    );
  });

  it('affiche l’erreur de chargement et relance via Réessayer', async () => {
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
