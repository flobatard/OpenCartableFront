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

  it('récupère l’arbre public et le pousse dans le signal', () => {
    service.load();
    httpMock.expectOne(url).flush(SUBJECTS_FIXTURE);

    expect(service.loading()).toBe(false);
    expect(service.tree()).toEqual(SUBJECTS_FIXTURE);
  });

  it('ne fait qu’un seul appel réseau pour plusieurs abonnés (cache shareReplay)', () => {
    service.tree$().subscribe();
    service.tree$().subscribe();
    httpMock.expectOne(url).flush(SUBJECTS_FIXTURE);
    httpMock.verify();
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
