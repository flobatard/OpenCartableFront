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

  it('loadList loads the list into the signals', () => {
    service.loadList();
    expect(service.listLoading()).toBe(true);
    httpMock.expectOne(url).flush(COURSES_FIXTURE);

    expect(service.list()).toEqual(COURSES_FIXTURE);
    expect(service.listLoading()).toBe(false);
    expect(service.listError()).toBe(false);
  });

  it('loadList reports the network error and a new call refetches', () => {
    service.loadList();
    httpMock.expectOne(url).error(new ProgressEvent('network'));
    expect(service.listError()).toBe(true);

    service.loadList();
    httpMock.expectOne(url).flush(COURSES_FIXTURE);
    expect(service.listError()).toBe(false);
    expect(service.list()).toEqual(COURSES_FIXTURE);
  });

  it('loadDetail clears the previous detail then loads the course', () => {
    loadDetail();
    expect(service.detail()).toEqual(COURSE_DETAIL_FIXTURE);

    service.loadDetail('course-2');
    expect(service.detail()).toBeNull(); // purge immédiate, pas de cours périmé affiché
    httpMock.expectOne(`${url}/course-2`).flush({ ...COURSE_DETAIL_FIXTURE, id: 'course-2' });
    expect(service.detail()?.id).toBe('course-2');
  });

  it('loadDetail reports the error (course not found or network)', () => {
    service.loadDetail('course-x');
    httpMock
      .expectOne(`${url}/course-x`)
      .flush({ detail: 'Cours introuvable' }, { status: 404, statusText: 'Not Found' });

    expect(service.detail()).toBeNull();
    expect(service.detailError()).toBe(true);
  });

  it('createCourse POSTs the exact payload', async () => {
    const payload = {
      title: 'Suites numériques',
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

  it('addBlock appends the returned block to the detail', async () => {
    loadDetail();
    const created: CourseBlock = {
      id: 'block-3',
      position: 2,
      type: 'exercise',
      title: null,
      description: null,
      content: { statement: '', questions: [] },
      resource_id: null,
      module_id: null,
    };

    const add = service.addBlock(COURSE_DETAIL_FIXTURE.id, 'exercise');
    const req = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ type: 'exercise' });
    req.flush(created);
    await add;

    expect(service.detail()?.blocks.at(-1)).toEqual(created);
    expect(service.detail()?.block_count).toBe(COURSE_DETAIL_FIXTURE.block_count + 1);
  });

  it('addBlock includes the title/description meta in the POST body', async () => {
    loadDetail();
    const meta = { title: 'Vidéo d’intro', description: 'Une présentation.' };
    const created: CourseBlock = {
      id: 'block-3',
      position: 2,
      type: 'document',
      title: meta.title,
      description: meta.description,
      content: { caption: null, display: 'inline' },
      resource_id: null,
      module_id: null,
    };

    const add = service.addBlock(COURSE_DETAIL_FIXTURE.id, 'document', meta);
    const req = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ type: 'document', ...meta });
    req.flush(created);
    await add;

    expect(service.detail()?.blocks.at(-1)).toEqual(created);
  });

  it('deleteBlock removes the block from the detail', async () => {
    loadDetail();
    const remove = service.deleteBlock(COURSE_DETAIL_FIXTURE.id, 'block-1');
    const req = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks/block-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await remove;

    expect(service.detail()?.blocks.map((b) => b.id)).toEqual(['block-2', 'block-3']);
    expect(service.detail()?.block_count).toBe(COURSE_DETAIL_FIXTURE.block_count - 1);
  });

  it('deleteCourse DELETEs, removes from the list and nulls the displayed detail', async () => {
    service.loadList();
    httpMock.expectOne(url).flush(COURSES_FIXTURE);
    loadDetail(); // détail = course-1

    const remove = service.deleteCourse(COURSE_DETAIL_FIXTURE.id);
    const req = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await remove;

    expect(service.list().map((c) => c.id)).toEqual(['course-2']);
    expect(service.detail()).toBeNull();
  });

  it('deleteCourse leaves the displayed detail of another course untouched', async () => {
    loadDetail(); // détail = course-1
    const remove = service.deleteCourse('course-2');
    httpMock.expectOne(`${url}/course-2`).flush(null, { status: 204, statusText: 'No Content' });
    await remove;

    expect(service.detail()).toEqual(COURSE_DETAIL_FIXTURE); // intact
  });

  it('reorderBlocks reorders the signal optimistically (before the PUT) then confirms', async () => {
    loadDetail();
    const reorder = service.reorderBlocks(COURSE_DETAIL_FIXTURE.id, [
      'block-2',
      'block-3',
      'block-1',
    ]);

    // Optimiste : le signal reflète déjà le nouvel ordre AVANT la réponse du PUT.
    expect(service.detail()?.blocks.map((b) => b.id)).toEqual(['block-2', 'block-3', 'block-1']);
    expect(service.detail()?.blocks.map((b) => b.position)).toEqual([0, 1, 2]);

    const req = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks/order`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ block_ids: ['block-2', 'block-3', 'block-1'] });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await reorder;

    // L'ordre tient après confirmation.
    expect(service.detail()?.blocks.map((b) => b.id)).toEqual(['block-2', 'block-3', 'block-1']);
    expect(service.detail()?.blocks.map((b) => b.position)).toEqual([0, 1, 2]);
  });

  it('reorderBlocks rejects on network error (the caller resyncs)', async () => {
    loadDetail();
    const reorder = service.reorderBlocks(COURSE_DETAIL_FIXTURE.id, [
      'block-2',
      'block-3',
      'block-1',
    ]);
    httpMock
      .expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks/order`)
      .error(new ProgressEvent('network'));

    await expect(reorder).rejects.toBeTruthy();
  });

  it('updateBlockContent PATCHes and replaces the block in the detail', async () => {
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

  it('updateBlockMeta PATCHes the title/description and replaces the block in the detail', async () => {
    loadDetail();
    const updated: CourseBlock = {
      ...COURSE_BLOCKS_FIXTURE[0],
      title: 'Titre modifié',
      description: null,
    };

    const update = service.updateBlockMeta(COURSE_DETAIL_FIXTURE.id, 'block-1', {
      title: 'Titre modifié',
      description: null,
    });
    const req = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks/block-1`);
    expect(req.request.method).toBe('PATCH');
    // Corps du méta uniquement (jamais `content`) ; `null` efface un champ.
    expect(req.request.body).toEqual({ title: 'Titre modifié', description: null });
    req.flush(updated);

    expect(await update).toEqual(updated);
    expect(service.detail()?.blocks[0]).toEqual(updated);
    expect(service.detail()?.blocks[1]).toEqual(COURSE_BLOCKS_FIXTURE[1]); // intact
  });

  it('updateBlockResource PATCHes resource_id (uuid or null) and replaces the block', async () => {
    loadDetail();
    const updated: CourseBlock = { ...COURSE_BLOCKS_FIXTURE[1], resource_id: 'resource-9' };

    const attach = service.updateBlockResource(COURSE_DETAIL_FIXTURE.id, 'block-2', 'resource-9');
    const req = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks/block-2`);
    expect(req.request.method).toBe('PATCH');
    // Corps dédié : uniquement resource_id (jamais content ni méta).
    expect(req.request.body).toEqual({ resource_id: 'resource-9' });
    req.flush(updated);

    expect(await attach).toEqual(updated);
    expect(service.detail()?.blocks[1]).toEqual(updated);

    const detach = service.updateBlockResource(COURSE_DETAIL_FIXTURE.id, 'block-2', null);
    const reqDetach = httpMock.expectOne(`${url}/${COURSE_DETAIL_FIXTURE.id}/blocks/block-2`);
    // `null` explicite = détacher la ressource (sémantique model_fields_set du back).
    expect(reqDetach.request.body).toEqual({ resource_id: null });
    reqDetach.flush({ ...updated, resource_id: null });
    await detach;

    expect(service.detail()?.blocks[1].resource_id).toBeNull();
  });

  it('a mutation of another course leaves the loaded detail untouched', async () => {
    loadDetail();
    const add = service.addBlock('course-2', 'text');
    httpMock
      .expectOne(`${url}/course-2/blocks`)
      .flush({ ...COURSE_BLOCKS_FIXTURE[0], id: 'block-x' });
    await add;

    expect(service.detail()).toEqual(COURSE_DETAIL_FIXTURE);
  });

  it('clears list and detail when the session drops', () => {
    service.loadList();
    httpMock.expectOne(url).flush(COURSES_FIXTURE);
    loadDetail();

    isAuthenticated.set(false);
    TestBed.tick(); // flush de l'effect de purge

    expect(service.list()).toEqual([]);
    expect(service.detail()).toBeNull();
  });

  it('prependToList inserts a course first (imported course)', () => {
    service.loadList();
    httpMock.expectOne(url).flush(COURSES_FIXTURE);
    const imported = { ...COURSES_FIXTURE[0], id: 'course-importe' };

    service.prependToList(imported);

    expect(service.list()[0]).toEqual(imported);
    expect(service.list()).toHaveLength(COURSES_FIXTURE.length + 1);
  });
});
