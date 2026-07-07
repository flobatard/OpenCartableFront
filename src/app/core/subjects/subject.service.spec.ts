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
    it('trouve un nœud imbriqué', () => {
      expect(findById(SUBJECTS_FIXTURE, 'math-algebre-ev')?.nom).toBe('Espaces vectoriels');
    });

    it('renvoie undefined pour un id inconnu', () => {
      expect(findById(SUBJECTS_FIXTURE, 'nope')).toBeUndefined();
    });
  });

  describe('findByCode', () => {
    it('trouve un nœud par code', () => {
      expect(findByCode(SUBJECTS_FIXTURE, 'francais.grammaire')?.id).toBe('francais-grammaire');
    });

    it('renvoie undefined pour un code inconnu', () => {
      expect(findByCode(SUBJECTS_FIXTURE, 'x.y')).toBeUndefined();
    });
  });

  describe('ancestorPath', () => {
    it('renvoie la racine pour une discipline', () => {
      expect(ancestorPath(SUBJECTS_FIXTURE, 'math').map((n) => n.nom)).toEqual(['Mathématiques']);
    });

    it('renvoie le chemin complet racine→feuille', () => {
      expect(ancestorPath(SUBJECTS_FIXTURE, 'math-algebre-ev').map((n) => n.nom)).toEqual([
        'Mathématiques',
        'Algèbre',
        'Espaces vectoriels',
      ]);
    });

    it('renvoie un tableau vide pour un id inconnu', () => {
      expect(ancestorPath(SUBJECTS_FIXTURE, 'nope')).toEqual([]);
    });
  });

  describe('flattenFiltered', () => {
    it('filtre sans tenir compte de la casse ni des accents', () => {
      const matches = flattenFiltered(SUBJECTS_FIXTURE, 'algebre');
      expect(matches.map((m) => m.node.nom)).toEqual(['Algèbre']);
    });

    it('correspond à tous les niveaux et renvoie le chemin d’ancêtres', () => {
      const matches = flattenFiltered(SUBJECTS_FIXTURE, 'a');
      const ev = matches.find((m) => m.node.id === 'math-algebre-ev');
      expect(ev?.path.map((n) => n.nom)).toEqual([
        'Mathématiques',
        'Algèbre',
        'Espaces vectoriels',
      ]);
    });

    it('renvoie un tableau vide pour un terme vide', () => {
      expect(flattenFiltered(SUBJECTS_FIXTURE, '   ')).toEqual([]);
    });
  });

  describe('formatPath', () => {
    it('joint les noms par le séparateur d’affichage', () => {
      const path = ancestorPath(SUBJECTS_FIXTURE, 'math-algebre-ev');
      expect(formatPath(path)).toBe('Mathématiques › Algèbre › Espaces vectoriels');
    });
  });

  describe('normalize', () => {
    it('retire accents et casse', () => {
      expect(normalize('Élève')).toBe('eleve');
    });
  });

  describe('allIds', () => {
    it('liste tous les ids de l’arbre', () => {
      expect(allIds(SUBJECTS_FIXTURE)).toHaveLength(6);
    });
  });

  describe('visibleRows', () => {
    it('ne montre que les racines quand rien n’est déplié', () => {
      const rows = visibleRows(SUBJECTS_FIXTURE, new Set());
      expect(rows.map((r) => r.node.id)).toEqual(['math', 'francais']);
      expect(rows[0]).toMatchObject({ depth: 0, hasChildren: true, expanded: false });
    });

    it('descend dans les enfants d’un nœud déplié', () => {
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
    it('élague aux branches contenant un résultat et les déplie', () => {
      const rows = filteredRows(SUBJECTS_FIXTURE, 'espaces');
      expect(rows.map((r) => r.node.id)).toEqual([
        'math',
        'math-algebre',
        'math-algebre-ev',
      ]);
      expect(rows.every((r) => r.expanded || !r.hasChildren)).toBe(true);
    });

    it('renvoie [] sans résultat', () => {
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

  it('récupère l’arbre et le pousse dans le signal', () => {
    service.load();
    httpMock.expectOne(url).flush(SUBJECTS_FIXTURE);

    expect(service.loading()).toBe(false);
    expect(service.tree()).toEqual(SUBJECTS_FIXTURE);
  });

  it('ne fait qu’un seul appel réseau pour plusieurs abonnés (cache shareReplay)', () => {
    service.tree$().subscribe();
    service.tree$().subscribe();
    httpMock.expectOne(url).flush(SUBJECTS_FIXTURE);
    httpMock.verify(); // échouerait s'il y avait une seconde requête
  });

  it('signale une erreur réseau et se recharge via reload()', () => {
    service.load();
    httpMock.expectOne(url).error(new ProgressEvent('network'));
    expect(service.error()).toBe(true);

    service.reload();
    httpMock.expectOne(url).flush(SUBJECTS_FIXTURE);
    expect(service.error()).toBe(false);
    expect(service.tree()).toEqual(SUBJECTS_FIXTURE);
  });
});
