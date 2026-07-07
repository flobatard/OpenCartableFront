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
    it('aplati l’arbre en parcours préfixe avec la profondeur', () => {
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

    it('renvoie [] pour un arbre vide', () => {
      expect(flattenTree([])).toEqual([]);
    });
  });

  describe('findById', () => {
    it('trouve un nœud imbriqué', () => {
      expect(findById(EDUCATION_LEVELS_FIXTURE, 'superieur-doctorat')?.nom).toBe('Doctorat');
    });

    it('renvoie undefined pour un id inconnu', () => {
      expect(findById(EDUCATION_LEVELS_FIXTURE, 'nope')).toBeUndefined();
    });
  });

  describe('sortByTreeOrder', () => {
    it('réordonne les ids selon l’ordre de l’arbre', () => {
      expect(
        sortByTreeOrder(EDUCATION_LEVELS_FIXTURE, ['superieur', 'college-6e', 'college']),
      ).toEqual(['college', 'college-6e', 'superieur']);
    });

    it('préserve les ids inconnus en fin, dans leur ordre d’origine', () => {
      expect(
        sortByTreeOrder(EDUCATION_LEVELS_FIXTURE, ['ghost-b', 'college-5e', 'ghost-a']),
      ).toEqual(['college-5e', 'ghost-b', 'ghost-a']);
    });

    it('sans arbre chargé, rend les ids inchangés', () => {
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

  it('récupère l’arbre et le pousse dans le signal', () => {
    service.load();
    httpMock.expectOne(url).flush(EDUCATION_LEVELS_FIXTURE);

    expect(service.loading()).toBe(false);
    expect(service.tree()).toEqual(EDUCATION_LEVELS_FIXTURE);
  });

  it('ne fait qu’un seul appel réseau pour plusieurs abonnés (cache shareReplay)', () => {
    service.tree$().subscribe();
    service.tree$().subscribe();
    httpMock.expectOne(url).flush(EDUCATION_LEVELS_FIXTURE);
    httpMock.verify(); // échouerait s'il y avait une seconde requête
  });

  it('signale une erreur réseau et se recharge via reload()', () => {
    service.load();
    httpMock.expectOne(url).error(new ProgressEvent('network'));
    expect(service.error()).toBe(true);

    service.reload();
    httpMock.expectOne(url).flush(EDUCATION_LEVELS_FIXTURE);
    expect(service.error()).toBe(false);
    expect(service.tree()).toEqual(EDUCATION_LEVELS_FIXTURE);
  });
});
