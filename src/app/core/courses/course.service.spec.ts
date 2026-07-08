import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import {
  COURSE_BLOCKS_FIXTURE,
  COURSE_DETAIL_FIXTURE,
  COURSES_FIXTURE,
} from '../../testing/courses.fixture';
import { AuthService } from '../auth/auth.service';
import { CourseBlock } from './course.model';
import { CourseService } from './course.service';

describe('CourseService', () => {
  let service: CourseService;
  let httpMock: HttpTestingController;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  const url = `${environment.apiUrl}/v1/courses`;

  beforeEach(() => {
    isAuthenticated = signal(true);
    TestBed.configureTestingModule({
      providers: [
        CourseService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: isAuthenticated.asReadonly() } },
      ],
    });
    service = TestBed.inject(CourseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function loadDetail(): void {
    service.loadDetail(COURSE_DETAIL_FIXTURE.id);
    httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}`).flush(COURSE_DETAIL_FIXTURE);
  }

  it('loadList charge la liste dans les signaux', () => {
    service.loadList();
    expect(service.listLoading()).toBe(true);
    httpMock.expectOne(url).flush(COURSES_FIXTURE);

    expect(service.list()).toEqual(COURSES_FIXTURE);
    expect(service.listLoading()).toBe(false);
    expect(service.listError()).toBe(false);
  });

  it('loadList signale l’erreur réseau et un nouvel appel refetch', () => {
    service.loadList();
    httpMock.expectOne(url).error(new ProgressEvent('network'));
    expect(service.listError()).toBe(true);

    service.loadList();
    httpMock.expectOne(url).flush(COURSES_FIXTURE);
    expect(service.listError()).toBe(false);
    expect(service.list()).toEqual(COURSES_FIXTURE);
  });

  it('loadDetail purge le détail précédent puis charge le cours', () => {
    loadDetail();
    expect(service.detail()).toEqual(COURSE_DETAIL_FIXTURE);

    service.loadDetail('course-2');
    expect(service.detail()).toBeNull(); // purge immédiate, pas de cours périmé affiché
    httpMock.expectOne(`${url}/course-2`).flush({ ...COURSE_DETAIL_FIXTURE, id: 'course-2' });
    expect(service.detail()?.id).toBe('course-2');
  });

  it('loadDetail signale l’erreur (cours introuvable ou réseau)', () => {
    service.loadDetail('course-x');
    httpMock
      .expectOne(`${url}/course-x`)
      .flush({ detail: 'Cours introuvable' }, { status: 404, statusText: 'Not Found' });

    expect(service.detail()).toBeNull();
    expect(service.detailError()).toBe(true);
  });

  it('createCourse fait un POST avec le payload exact', async () => {
    const payload = {
      titre: 'Suites numériques',
      description: null,
      subject_ids: ['math'],
      education_level_ids: ['college-6e'],
    };
    const create = service.createCourse(payload);
    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(COURSES_FIXTURE[0]);

    expect(await create).toEqual(COURSES_FIXTURE[0]);
  });

  it('addBlock ajoute le bloc renvoyé en fin de détail', async () => {
    loadDetail();
    const created: CourseBlock = {
      id: 'block-3',
      position: 2,
      type: 'exercice',
      titre: null,
      description: null,
      content: { enonce: '', questions: [] },
      resource_id: null,
    };

    const add = service.addBlock(COURSE_DETAIL_FIXTURE.id, 'exercice');
    const req = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ type: 'exercice' });
    req.flush(created);
    await add;

    expect(service.detail()?.blocks.at(-1)).toEqual(created);
    expect(service.detail()?.block_count).toBe(COURSE_DETAIL_FIXTURE.block_count + 1);
  });

  it('addBlock inclut le méta titre/description dans le corps du POST', async () => {
    loadDetail();
    const meta = { titre: 'Vidéo d’intro', description: 'Une présentation.' };
    const created: CourseBlock = {
      id: 'block-3',
      position: 2,
      type: 'lien',
      titre: meta.titre,
      description: meta.description,
      content: {},
      resource_id: null,
    };

    const add = service.addBlock(COURSE_DETAIL_FIXTURE.id, 'lien', meta);
    const req = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ type: 'lien', ...meta });
    req.flush(created);
    await add;

    expect(service.detail()?.blocks.at(-1)).toEqual(created);
  });

  it('deleteBlock retire le bloc du détail', async () => {
    loadDetail();
    const remove = service.deleteBlock(COURSE_DETAIL_FIXTURE.id, 'block-1');
    const req = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks/block-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await remove;

    expect(service.detail()?.blocks.map((b) => b.id)).toEqual(['block-2']);
    expect(service.detail()?.block_count).toBe(COURSE_DETAIL_FIXTURE.block_count - 1);
  });

  it('reorderBlocks envoie l’ordre complet puis réécrit blocs et positions', async () => {
    loadDetail();
    const reorder = service.reorderBlocks(COURSE_DETAIL_FIXTURE.id, ['block-2', 'block-1']);
    const req = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks/order`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ block_ids: ['block-2', 'block-1'] });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await reorder;

    expect(service.detail()?.blocks.map((b) => b.id)).toEqual(['block-2', 'block-1']);
    expect(service.detail()?.blocks.map((b) => b.position)).toEqual([0, 1]);
  });

  it('updateBlockContent fait un PATCH et remplace le bloc dans le détail', async () => {
    loadDetail();
    const updated: CourseBlock = {
      ...COURSE_BLOCKS_FIXTURE[0],
      content: { markdown: '## Nouveau contenu' },
    };

    const update = service.updateBlockContent(COURSE_DETAIL_FIXTURE.id, 'block-1', {
      markdown: '## Nouveau contenu',
    });
    const req = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks/block-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ content: { markdown: '## Nouveau contenu' } });
    req.flush(updated);

    expect(await update).toEqual(updated);
    expect(service.detail()?.blocks[0]).toEqual(updated);
    expect(service.detail()?.blocks[1]).toEqual(COURSE_BLOCKS_FIXTURE[1]); // intact
  });

  it('updateBlockMeta PATCH le titre/description et remplace le bloc dans le détail', async () => {
    loadDetail();
    const updated: CourseBlock = {
      ...COURSE_BLOCKS_FIXTURE[0],
      titre: 'Titre modifié',
      description: null,
    };

    const update = service.updateBlockMeta(COURSE_DETAIL_FIXTURE.id, 'block-1', {
      titre: 'Titre modifié',
      description: null,
    });
    const req = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks/block-1`);
    expect(req.request.method).toBe('PATCH');
    // Corps du méta uniquement (jamais `content`) ; `null` efface un champ.
    expect(req.request.body).toEqual({ titre: 'Titre modifié', description: null });
    req.flush(updated);

    expect(await update).toEqual(updated);
    expect(service.detail()?.blocks[0]).toEqual(updated);
    expect(service.detail()?.blocks[1]).toEqual(COURSE_BLOCKS_FIXTURE[1]); // intact
  });

  it('une mutation d’un autre cours ne touche pas le détail chargé', async () => {
    loadDetail();
    const add = service.addBlock('course-2', 'texte');
    httpMock
      .expectOne(`${url}/course-2/blocks`)
      .flush({ ...COURSE_BLOCKS_FIXTURE[0], id: 'block-x' });
    await add;

    expect(service.detail()).toEqual(COURSE_DETAIL_FIXTURE);
  });

  it('purge liste et détail quand la session tombe', () => {
    service.loadList();
    httpMock.expectOne(url).flush(COURSES_FIXTURE);
    loadDetail();

    isAuthenticated.set(false);
    TestBed.tick(); // flush de l'effect de purge

    expect(service.list()).toEqual([]);
    expect(service.detail()).toBeNull();
  });
});
