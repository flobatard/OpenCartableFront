import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CourseList } from './course-list';
import { CourseService } from '../../../core/courses/course.service';
import { EducationLevelService } from '../../../core/education-levels/education-level.service';
import { SubjectService } from '../../../core/subjects/subject.service';
import { COURSES_FIXTURE } from '../../../testing/courses.fixture';
import { EDUCATION_LEVELS_FIXTURE } from '../../../testing/education-levels.fixture';
import { SUBJECTS_FIXTURE } from '../../../testing/subjects.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';

describe('CourseList', () => {
  const list = signal(COURSES_FIXTURE);
  const listLoading = signal(false);
  const listError = signal(false);
  const coursesMock = { list, listLoading, listError, loadList: vi.fn() };
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

  async function createComponent(): Promise<ComponentFixture<CourseList>> {
    await TestBed.configureTestingModule({
      imports: [CourseList, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: CourseService, useValue: coursesMock },
        { provide: SubjectService, useValue: subjectsMock },
        { provide: EducationLevelService, useValue: levelsMock },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseList);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<CourseList>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    list.set(COURSES_FIXTURE);
    listLoading.set(false);
    listError.set(false);
    vi.clearAllMocks();
  });

  it('refetch la liste et charge les arbres de référence au démarrage', async () => {
    await createComponent();
    expect(coursesMock.loadList).toHaveBeenCalled();
    expect(subjectsMock.load).toHaveBeenCalled();
    expect(levelsMock.load).toHaveBeenCalled();
  });

  it('affiche les cartes : titres, badges résolus, compteur de blocs', async () => {
    const fixture = await createComponent();

    const titles = Array.from(el(fixture).querySelectorAll('.course-list__card-title')).map(
      (n) => n.textContent?.trim(),
    );
    expect(titles).toEqual(['Suites numériques', 'Grammaire — les accords']);

    const cards = el(fixture).querySelectorAll('.course-list__card');
    const badges = (card: Element) =>
      Array.from(card.querySelectorAll('.course-list__badge')).map((b) => b.textContent?.trim());
    expect(badges(cards[0])).toEqual(['Mathématiques', '6e']);
    // L'id de matière inconnu de l'arbre n'a pas de chip (contrat des pickers).
    expect(badges(cards[1])).toEqual(['Grammaire']);

    expect(cards[0].querySelector('.course-list__meta')?.textContent).toContain('2 bloc(s)');
  });

  it('chaque carte mène à l’espace blocs et l’en-tête à la création', async () => {
    const fixture = await createComponent();
    const links = Array.from(el(fixture).querySelectorAll<HTMLAnchorElement>('a'));

    expect(links.some((a) => a.getAttribute('href') === '/fr/courses/new')).toBe(true);
    expect(links.some((a) => a.getAttribute('href') === '/fr/courses/course-1')).toBe(true);
  });

  it('affiche un skeleton pendant le chargement', async () => {
    listLoading.set(true);
    const fixture = await createComponent();
    expect(el(fixture).querySelector('.course-list__skeleton')).toBeTruthy();
    expect(el(fixture).querySelector('.course-list__cards')).toBeNull();
  });

  it('affiche l’erreur et relance le fetch via Réessayer', async () => {
    listError.set(true);
    const fixture = await createComponent();
    const retry = el(fixture).querySelector<HTMLButtonElement>('.course-list__error .btn');
    expect(retry).toBeTruthy();

    coursesMock.loadList.mockClear();
    retry?.click();
    expect(coursesMock.loadList).toHaveBeenCalled();
  });

  it('sans cours, invite à composer le premier', async () => {
    list.set([]);
    const fixture = await createComponent();
    const empty = el(fixture).querySelector('.course-list__empty');
    expect(empty?.textContent).toContain('Compose ton premier cours');
    expect(empty?.querySelector('a')?.getAttribute('href')).toBe('/fr/courses/new');
  });
});
