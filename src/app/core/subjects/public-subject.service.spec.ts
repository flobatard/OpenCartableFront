import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { SUBJECTS_FIXTURE } from '../../testing/subjects.fixture';
import { PublicSubjectService } from './public-subject.service';

describe('PublicSubjectService', () => {
  let service: PublicSubjectService;
  let httpMock: HttpTestingController;
  // URL sous /v1/public/ : exclue de l'attachement du Bearer par la
  // customUrlValidation d'app.config.ts — la page de recherche anonyme en dépend.
  const url = `${environment.apiUrl}/v1/public/subjects/tree`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PublicSubjectService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PublicSubjectService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the public tree and pushes it into the signal', () => {
    service.load();
    httpMock.expectOne(url).flush(SUBJECTS_FIXTURE);

    expect(service.loading()).toBe(false);
    expect(service.tree()).toEqual(SUBJECTS_FIXTURE);
  });

  it('issues a single network call for several subscribers (shareReplay cache)', () => {
    service.tree$().subscribe();
    service.tree$().subscribe();
    httpMock.expectOne(url).flush(SUBJECTS_FIXTURE);
    httpMock.verify();
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
