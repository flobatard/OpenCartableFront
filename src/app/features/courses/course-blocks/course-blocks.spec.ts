import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
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
  });

  it('charge le cours du paramètre de route et l’affiche avec ses badges', async () => {
    const fixture = await createComponent();

    expect(coursesMock.loadDetail).toHaveBeenCalledWith('course-1');
    expect(el(fixture).querySelector('.course-blocks__title')?.textContent).toContain(
      'Suites numériques',
    );
    const badges = Array.from(el(fixture).querySelectorAll('.course-blocks__badge')).map(
      (b) => b.textContent?.trim(),
    );
    expect(badges).toEqual(['Mathématiques', '6e']);
  });

  it('rend les blocs dans l’ordre avec leur type et leur extrait', async () => {
    const fixture = await createComponent();
    const types = rows(fixture).map((r) =>
      r.querySelector('.course-blocks__type')?.textContent?.trim(),
    );
    const excerpts = rows(fixture).map((r) =>
      r.querySelector('.course-blocks__excerpt')?.textContent?.trim(),
    );

    expect(types).toEqual(['Texte', 'Lien']);
    // Le lien sans titre replie sur son URL.
    expect(excerpts).toEqual(['Introduction aux suites', 'https://exemple.org/video']);
  });

  it('propose « Modifier » sur les blocs texte uniquement', async () => {
    const fixture = await createComponent();
    const [texteRow, lienRow] = rows(fixture);

    const edit = texteRow.querySelector<HTMLAnchorElement>('.course-blocks__edit');
    expect(edit).toBeTruthy();
    expect(edit?.getAttribute('href')).toBe('/fr/courses/course-1/blocks/block-1');
    expect(lienRow.querySelector('.course-blocks__edit')).toBeNull();
  });

  it('désactive monter en tête de liste et descendre en queue', async () => {
    const fixture = await createComponent();
    const [firstRow, lastRow] = rows(fixture);
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

    expect(coursesMock.reorderBlocks).toHaveBeenCalledWith('course-1', ['block-2', 'block-1']);
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

  it('ajoute un bloc du type choisi ; « ressource » est désactivé avec sa mention', async () => {
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

    addButtons[0].click();
    await fixture.whenStable();
    expect(coursesMock.addBlock).toHaveBeenCalledWith('course-1', 'texte');
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
