import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { EDUCATION_LEVELS_FIXTURE } from '../../testing/education-levels.fixture';
import { EducationLevelService } from './education-level.service';
import { findById, flattenTree, sortByTreeOrder } from './education-level.utils';

describe('education-level.utils', () => {
  describe('flattenTree', () => {
    it('flattens the tree in preorder with the depth', () => {
      const rows = flattenTree(EDUCATION_LEVELS_FIXTURE);
      expect(rows.map((r) => r.node.id)).toEqual([
        'college',
        'college-6e',
        'college-5e',
        'superieur',
        'superieur-doctorat',
      ]);
      expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 0, 1]);
    });

    it('returns [] for an empty tree', () => {
      expect(flattenTree([])).toEqual([]);
    });
  });

  describe('findById', () => {
    it('finds a nested node', () => {
      expect(findById(EDUCATION_LEVELS_FIXTURE, 'superieur-doctorat')?.name).toBe('Doctorat');
    });

    it('returns undefined for an unknown id', () => {
      expect(findById(EDUCATION_LEVELS_FIXTURE, 'nope')).toBeUndefined();
    });
  });

  describe('sortByTreeOrder', () => {
    it('reorders the ids following the tree order', () => {
      expect(
        sortByTreeOrder(EDUCATION_LEVELS_FIXTURE, ['superieur', 'college-6e', 'college']),
      ).toEqual(['college', 'college-6e', 'superieur']);
    });

    it('keeps unknown ids at the end, in their original order', () => {
      expect(
        sortByTreeOrder(EDUCATION_LEVELS_FIXTURE, ['ghost-b', 'college-5e', 'ghost-a']),
      ).toEqual(['college-5e', 'ghost-b', 'ghost-a']);
    });

    it('returns the ids unchanged when no tree is loaded', () => {
      expect(sortByTreeOrder([], ['b', 'a'])).toEqual(['b', 'a']);
    });
  });
});

describe('EducationLevelService', () => {
  let service: EducationLevelService;
  let httpMock: HttpTestingController;
  const url = `${environment.apiUrl}/v1/education-levels/tree`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EducationLevelService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EducationLevelService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the tree and pushes it into the signal', () => {
    service.load();
    httpMock.expectOne(url).flush(EDUCATION_LEVELS_FIXTURE);

    expect(service.loading()).toBe(false);
    expect(service.tree()).toEqual(EDUCATION_LEVELS_FIXTURE);
  });

  it('issues a single network call for several subscribers (shareReplay cache)', () => {
    service.tree$().subscribe();
    service.tree$().subscribe();
    httpMock.expectOne(url).flush(EDUCATION_LEVELS_FIXTURE);
    httpMock.verify(); // échouerait s'il y avait une seconde requête
  });

  it('reports a network error and reloads via reload()', () => {
    service.load();
    httpMock.expectOne(url).error(new ProgressEvent('network'));
    expect(service.error()).toBe(true);

    service.reload();
    httpMock.expectOne(url).flush(EDUCATION_LEVELS_FIXTURE);
    expect(service.error()).toBe(false);
    expect(service.tree()).toEqual(EDUCATION_LEVELS_FIXTURE);
  });
});
