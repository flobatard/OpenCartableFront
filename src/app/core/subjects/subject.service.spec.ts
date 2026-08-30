import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { SUBJECTS_FIXTURE } from '../../testing/subjects.fixture';
import { SubjectService } from './subject.service';
import {
  allIds,
  ancestorPath,
  filteredRows,
  findByCode,
  findById,
  flattenFiltered,
  formatPath,
  normalize,
  visibleRows,
} from './subject.utils';

describe('subject.utils', () => {
  describe('findById', () => {
    it('finds a nested node', () => {
      expect(findById(SUBJECTS_FIXTURE, 'math-algebre-ev')?.name).toBe('Espaces vectoriels');
    });

    it('returns undefined for an unknown id', () => {
      expect(findById(SUBJECTS_FIXTURE, 'nope')).toBeUndefined();
    });
  });

  describe('findByCode', () => {
    it('finds a node by code', () => {
      expect(findByCode(SUBJECTS_FIXTURE, 'francais.grammaire')?.id).toBe('francais-grammaire');
    });

    it('returns undefined for an unknown code', () => {
      expect(findByCode(SUBJECTS_FIXTURE, 'x.y')).toBeUndefined();
    });
  });

  describe('ancestorPath', () => {
    it('returns the root for a discipline', () => {
      expect(ancestorPath(SUBJECTS_FIXTURE, 'math').map((n) => n.name)).toEqual(['Mathématiques']);
    });

    it('returns the full root→leaf path', () => {
      expect(ancestorPath(SUBJECTS_FIXTURE, 'math-algebre-ev').map((n) => n.name)).toEqual([
        'Mathématiques',
        'Algèbre',
        'Espaces vectoriels',
      ]);
    });

    it('returns an empty array for an unknown id', () => {
      expect(ancestorPath(SUBJECTS_FIXTURE, 'nope')).toEqual([]);
    });
  });

  describe('flattenFiltered', () => {
    it('filters ignoring case and accents', () => {
      const matches = flattenFiltered(SUBJECTS_FIXTURE, 'algebre');
      expect(matches.map((m) => m.node.name)).toEqual(['Algèbre']);
    });

    it('matches at every level and returns the ancestor path', () => {
      const matches = flattenFiltered(SUBJECTS_FIXTURE, 'a');
      const ev = matches.find((m) => m.node.id === 'math-algebre-ev');
      expect(ev?.path.map((n) => n.name)).toEqual([
        'Mathématiques',
        'Algèbre',
        'Espaces vectoriels',
      ]);
    });

    it('returns an empty array for a blank term', () => {
      expect(flattenFiltered(SUBJECTS_FIXTURE, '   ')).toEqual([]);
    });
  });

  describe('formatPath', () => {
    it('joins the names with the display separator', () => {
      const path = ancestorPath(SUBJECTS_FIXTURE, 'math-algebre-ev');
      expect(formatPath(path)).toBe('Mathématiques › Algèbre › Espaces vectoriels');
    });
  });

  describe('normalize', () => {
    it('strips accents and case', () => {
      expect(normalize('Élève')).toBe('eleve');
    });
  });

  describe('allIds', () => {
    it('lists every id of the tree', () => {
      expect(allIds(SUBJECTS_FIXTURE)).toHaveLength(6);
    });
  });

  describe('visibleRows', () => {
    it('shows only the roots when nothing is expanded', () => {
      const rows = visibleRows(SUBJECTS_FIXTURE, new Set());
      expect(rows.map((r) => r.node.id)).toEqual(['math', 'francais']);
      expect(rows[0]).toMatchObject({ depth: 0, hasChildren: true, expanded: false });
    });

    it('descends into the children of an expanded node', () => {
      const rows = visibleRows(SUBJECTS_FIXTURE, new Set(['math']));
      expect(rows.map((r) => r.node.id)).toEqual([
        'math',
        'math-algebre',
        'math-analyse',
        'francais',
      ]);
      expect(rows.find((r) => r.node.id === 'math-algebre')?.depth).toBe(1);
    });
  });

  describe('filteredRows', () => {
    it('prunes to branches containing a match and expands them', () => {
      const rows = filteredRows(SUBJECTS_FIXTURE, 'espaces');
      expect(rows.map((r) => r.node.id)).toEqual([
        'math',
        'math-algebre',
        'math-algebre-ev',
      ]);
      expect(rows.every((r) => r.expanded || !r.hasChildren)).toBe(true);
    });

    it('returns [] without any match', () => {
      expect(filteredRows(SUBJECTS_FIXTURE, 'zzz')).toEqual([]);
    });
  });
});

describe('SubjectService', () => {
  let service: SubjectService;
  let httpMock: HttpTestingController;
  const url = `${environment.apiUrl}/v1/subjects/tree`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SubjectService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SubjectService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the tree and pushes it into the signal', () => {
    service.load();
    httpMock.expectOne(url).flush(SUBJECTS_FIXTURE);

    expect(service.loading()).toBe(false);
    expect(service.tree()).toEqual(SUBJECTS_FIXTURE);
  });

  it('issues a single network call for several subscribers (shareReplay cache)', () => {
    service.tree$().subscribe();
    service.tree$().subscribe();
    httpMock.expectOne(url).flush(SUBJECTS_FIXTURE);
    httpMock.verify(); // échouerait s'il y avait une seconde requête
  });

  it('reports a network error and reloads via reload()', () => {
    service.load();
    httpMock.expectOne(url).error(new ProgressEvent('network'));
    expect(service.error()).toBe(true);

    service.reload();
    httpMock.expectOne(url).flush(SUBJECTS_FIXTURE);
    expect(service.error()).toBe(false);
    expect(service.tree()).toEqual(SUBJECTS_FIXTURE);
  });
});
