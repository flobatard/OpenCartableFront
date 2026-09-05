import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { PublicEducationLevelService } from '../../core/education-levels/public-education-level.service';
import { SearchPage } from '../../core/search/search.model';
import { SEARCH_PAGE_SIZE, SearchService } from '../../core/search/search.service';
import { PublicSubjectService } from '../../core/subjects/public-subject.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { Search } from './search';
import { mockEducationLevelService, mockSubjectService } from '../../testing/service-mocks';

const COURSE = {
  id: 'c1',
  title: 'Théorème de Pythagore',
  description: null,
  subjects: ['Mathématiques'],
  education_levels: ['4e'],
  block_count: 3,
  preview_settings: {},
  updated_at: '2026-07-07T12:00:00Z',
};

const TEACHER = {
  id: 'u1',
  public_name: 'Mme Ada',
  avatar_url: null,
  subjects: ['Info'],
  public_course_count: 2,
};

function page<T>(items: T[], total = items.length, offset = 0): SearchPage<T> {
  return { items, total, limit: SEARCH_PAGE_SIZE, offset };
}

describe('Search', () => {
  const searchMock = {
    coursesPage: signal<SearchPage<typeof COURSE> | null>(null),
    coursesLoading: signal(false),
    coursesError: signal(false),
    teachersPage: signal<SearchPage<typeof TEACHER> | null>(null),
    teachersLoading: signal(false),
    teachersError: signal(false),
    searchCourses: vi.fn(),
    searchTeachers: vi.fn(),
  };
  const subjectsMock = mockSubjectService();
  const levelsMock = mockEducationLevelService();

  beforeEach(() => {
    searchMock.coursesPage.set(null);
    searchMock.coursesLoading.set(false);
    searchMock.coursesError.set(false);
    searchMock.teachersPage.set(null);
    searchMock.teachersLoading.set(false);
    searchMock.teachersError.set(false);
    vi.clearAllMocks();
  });

  async function mount(queryParams: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      imports: [Search, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: SearchService, useValue: searchMock },
        { provide: PublicSubjectService, useValue: subjectsMock },
        { provide: PublicEducationLevelService, useValue: levelsMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(Search);
    await fixture.whenStable();
    return fixture;
  }

  it('runs a course search on mount and loads the public trees', async () => {
    await mount();
    expect(subjectsMock.load).toHaveBeenCalled();
    expect(levelsMock.load).toHaveBeenCalled();
    expect(searchMock.searchCourses).toHaveBeenCalledWith({
      q: '',
      subjectId: null,
      educationLevelId: null,
      page: 1,
    });
    expect(searchMock.searchTeachers).not.toHaveBeenCalled();
  });

  it('seeds the state from the query params (shareable URL)', async () => {
    await mount({ tab: 'teachers', q: 'ada', subject: 's1', page: '3' });
    expect(searchMock.searchTeachers).toHaveBeenCalledWith({
      q: 'ada',
      subjectId: 's1',
      educationLevelId: null,
      page: 3,
    });
  });

  it('shows course result cards (shared public card)', async () => {
    searchMock.coursesPage.set(page([COURSE]));
    const fixture = await mount();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-public-course-card')).not.toBeNull();
    expect(el.textContent).toContain('Théorème de Pythagore');
  });

  it('tab switch: searches teachers and resets the page to 1', async () => {
    searchMock.teachersPage.set(page([TEACHER]));
    const fixture = await mount({ page: '2' });
    const el = fixture.nativeElement as HTMLElement;

    el.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    await fixture.whenStable();

    expect(searchMock.searchTeachers).toHaveBeenCalledWith({
      q: '',
      subjectId: null,
      educationLevelId: null,
      page: 1,
    });
    expect(el.textContent).toContain('Mme Ada');
    // Avatar sur la carte prof : sans URL, le repli SVG générique s'affiche.
    expect(el.querySelector('.search__teacher-head app-user-avatar svg')).not.toBeNull();
  });

  it('a facet change re-runs the search at page 1', async () => {
    const fixture = await mount({ q: 'x', page: '4' });
    const el = fixture.nativeElement as HTMLElement;
    const select = el.querySelectorAll<HTMLSelectElement>('.search__select')[0];

    select.value = select.options[1].value; // première matière de l'arbre
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(searchMock.searchCourses).toHaveBeenLastCalledWith({
      q: 'x',
      subjectId: select.value,
      educationLevelId: null,
      page: 1,
    });
  });

  it('debounced typing re-runs the search', async () => {
    // Le montage se fait en vrais timers (whenStable) ; seuls la frappe et
    // le debounce rxjs (350 ms) passent en timers factices.
    const fixture = await mount();
    const search = fixture.componentInstance as Search;
    vi.useFakeTimers();
    try {
      search.searchControl.setValue('pythagore');
      vi.advanceTimersByTime(400);
      expect(searchMock.searchCourses).toHaveBeenLastCalledWith({
        q: 'pythagore',
        subjectId: null,
        educationLevelId: null,
        page: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('pagination: distinct empty state, bounds and navigation', async () => {
    searchMock.coursesPage.set(page([COURSE], 45, SEARCH_PAGE_SIZE));
    const fixture = await mount({ page: '2' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.search__pagination-range')?.textContent).toContain('21');
    const [prev, next] = el.querySelectorAll<HTMLButtonElement>('.search__pagination .btn');
    expect(prev.disabled).toBe(false);
    next.click();
    await fixture.whenStable();
    expect(searchMock.searchCourses).toHaveBeenLastCalledWith({
      q: '',
      subjectId: null,
      educationLevelId: null,
      page: 3,
    });
  });

  it('shows the empty state and the error state with retry', async () => {
    searchMock.coursesPage.set(page([]));
    const fixture = await mount();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.search__notice')).not.toBeNull();

    searchMock.coursesError.set(true);
    await fixture.whenStable();
    const retry = el.querySelector<HTMLButtonElement>('.search__notice .btn');
    retry?.click();
    await fixture.whenStable();
    // force=true : même requête relancée malgré le garde-fou anti-doublon.
    expect(searchMock.searchCourses).toHaveBeenCalledTimes(2);
  });
});
