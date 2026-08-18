import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { SearchCourseResult, SearchPage, SearchQuery } from './search.model';
import { SEARCH_PAGE_SIZE, SearchService } from './search.service';

const COURSES_URL = `${environment.apiUrl}/v1/public/search/courses`;
const TEACHERS_URL = `${environment.apiUrl}/v1/public/search/teachers`;

function page<T>(items: T[], total = items.length): SearchPage<T> {
  return { items, total, limit: SEARCH_PAGE_SIZE, offset: 0 };
}

function query(overrides: Partial<SearchQuery> = {}): SearchQuery {
  return { q: '', subjectId: null, educationLevelId: null, page: 1, ...overrides };
}

const COURSE: SearchCourseResult = {
  id: 'c1',
  titre: 'Théorème de Pythagore',
  description: null,
  subjects: ['Mathématiques'],
  education_levels: ['4e'],
  block_count: 3,
  preview_settings: {},
  updated_at: '2026-07-07T12:00:00Z',
};

describe('SearchService', () => {
  let service: SearchService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SearchService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SearchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('ne sérialise que les paramètres non vides (q blanc omis)', () => {
    service.searchCourses(query({ q: '   ' }));
    const req = httpMock.expectOne(
      (r) => r.url === COURSES_URL && !r.params.has('q') && !r.params.has('subject_id'),
    );
    expect(req.request.params.get('limit')).toBe(String(SEARCH_PAGE_SIZE));
    expect(req.request.params.get('offset')).toBe('0');
    req.flush(page([COURSE]));
    expect(service.coursesPage()?.items).toHaveLength(1);
    expect(service.coursesLoading()).toBe(false);
  });

  it('traduit la page en offset et sérialise les facettes', () => {
    service.searchCourses(
      query({ q: 'pythagore', subjectId: 's1', educationLevelId: 'l1', page: 3 }),
    );
    const req = httpMock.expectOne((r) => r.url === COURSES_URL);
    expect(req.request.params.get('q')).toBe('pythagore');
    expect(req.request.params.get('subject_id')).toBe('s1');
    expect(req.request.params.get('education_level_id')).toBe('l1');
    expect(req.request.params.get('offset')).toBe(String(2 * SEARCH_PAGE_SIZE));
    req.flush(page([COURSE]));
  });

  it('seule la dernière requête écrit les signaux (stale-guard)', () => {
    service.searchCourses(query({ q: 'ancienne' }));
    service.searchCourses(query({ q: 'recente' }));
    const [first, second] = httpMock.match((r) => r.url === COURSES_URL);

    // La réponse la plus récente arrive d'abord…
    second.flush(page([COURSE], 1));
    // …puis la périmée : elle ne doit pas écraser l'état.
    first.flush(page([], 0));

    expect(service.coursesPage()?.total).toBe(1);
    expect(service.coursesLoading()).toBe(false);
  });

  it('signale une erreur réseau et repart à la recherche suivante', () => {
    service.searchCourses(query({ q: 'x' }));
    httpMock.expectOne((r) => r.url === COURSES_URL).error(new ProgressEvent('network'));
    expect(service.coursesError()).toBe(true);

    service.searchCourses(query({ q: 'y' }));
    expect(service.coursesError()).toBe(false);
    httpMock.expectOne((r) => r.url === COURSES_URL).flush(page([COURSE]));
    expect(service.coursesPage()?.items).toHaveLength(1);
  });

  it('recherche les professeurs sur l’endpoint dédié', () => {
    service.searchTeachers(query({ q: 'ada' }));
    const req = httpMock.expectOne((r) => r.url === TEACHERS_URL);
    req.flush(
      page([{ id: 'u1', nom_public: 'Mme Ada', subjects: [], public_course_count: 2 }]),
    );
    expect(service.teachersPage()?.items[0].nom_public).toBe('Mme Ada');
    expect(service.teachersLoading()).toBe(false);
  });
});
