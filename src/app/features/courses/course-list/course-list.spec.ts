import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CourseList } from './course-list';
import { CourseService } from '../../../core/courses/course.service';
import { CourseTransferService } from '../../../core/courses/course-transfer.service';
import { EducationLevelService } from '../../../core/education-levels/education-level.service';
import { SubjectService } from '../../../core/subjects/subject.service';
import { COURSES_FIXTURE } from '../../../testing/courses.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { mockEducationLevelService, mockSubjectService } from '../../../testing/service-mocks';

describe('CourseList', () => {
  const list = signal(COURSES_FIXTURE);
  const listLoading = signal(false);
  const listError = signal(false);
  const coursesMock = {
    list,
    listLoading,
    listError,
    loadList: vi.fn(),
  };
  // Consommé par la modale d'import montée par la page.
  const transferMock = {
    importState: signal({ phase: 'idle' as const, progress: 0 }),
    importCourse: vi.fn(),
  };
  const subjectsMock = mockSubjectService();
  const levelsMock = mockEducationLevelService();

  async function createComponent(): Promise<ComponentFixture<CourseList>> {
    await TestBed.configureTestingModule({
      imports: [CourseList, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: CourseService, useValue: coursesMock },
        { provide: CourseTransferService, useValue: transferMock },
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

  it('refetches the list and loads the reference trees on startup', async () => {
    await createComponent();
    expect(coursesMock.loadList).toHaveBeenCalled();
    expect(subjectsMock.load).toHaveBeenCalled();
    expect(levelsMock.load).toHaveBeenCalled();
  });

  it('shows the cards: titles, resolved badges, block count', async () => {
    const fixture = await createComponent();

    // Le h2 embarque le badge de visibilité : on ne lit que le nœud texte du titre.
    const titles = Array.from(el(fixture).querySelectorAll('.course-list__card-title')).map(
      (n) => n.childNodes[0].textContent?.trim(),
    );
    expect(titles).toEqual(['Suites numériques', 'Grammaire — les accords']);

    const visibility = Array.from(
      el(fixture).querySelectorAll('.course-list__visibility-badge'),
    ).map((n) => n.textContent?.trim());
    expect(visibility).toEqual(['Brouillon', 'Brouillon']);

    const cards = el(fixture).querySelectorAll('.course-list__card');
    const badges = (card: Element) =>
      Array.from(card.querySelectorAll('.course-list__badge')).map((b) => b.textContent?.trim());
    expect(badges(cards[0])).toEqual(['Mathématiques', '6e']);
    // L'id de matière inconnu de l'arbre n'a pas de chip (contrat des pickers).
    expect(badges(cards[1])).toEqual(['Grammaire']);

    expect(cards[0].querySelector('.course-list__meta')?.textContent).toContain('3 bloc(s)');
  });

  it('each card leads to the blocks workspace and the header to creation', async () => {
    const fixture = await createComponent();
    const links = Array.from(el(fixture).querySelectorAll<HTMLAnchorElement>('a'));

    expect(links.some((a) => a.getAttribute('href') === '/fr/courses/new')).toBe(true);
    expect(links.some((a) => a.getAttribute('href') === '/fr/courses/course-1')).toBe(true);
  });

  it('shows a skeleton while loading', async () => {
    listLoading.set(true);
    const fixture = await createComponent();
    expect(el(fixture).querySelector('.course-list__skeleton')).toBeTruthy();
    expect(el(fixture).querySelector('.course-list__cards')).toBeNull();
  });

  it('shows the error and refetches via the retry button', async () => {
    listError.set(true);
    const fixture = await createComponent();
    const retry = el(fixture).querySelector<HTMLButtonElement>('.course-list__error .btn');
    expect(retry).toBeTruthy();

    coursesMock.loadList.mockClear();
    retry?.click();
    expect(coursesMock.loadList).toHaveBeenCalled();
  });

  it('without courses, invites to compose the first one', async () => {
    list.set([]);
    const fixture = await createComponent();
    const empty = el(fixture).querySelector('.course-list__empty');
    expect(empty?.textContent).toContain('Compose ton premier cours');
    expect(empty?.querySelector('a')?.getAttribute('href')).toBe('/fr/courses/new');
  });
});
