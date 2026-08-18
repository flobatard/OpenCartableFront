import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { EDUCATION_LEVELS_FIXTURE } from '../../testing/education-levels.fixture';
import { PublicEducationLevelService } from './public-education-level.service';

describe('PublicEducationLevelService', () => {
  let service: PublicEducationLevelService;
  let httpMock: HttpTestingController;
  const url = `${environment.apiUrl}/v1/public/education-levels/tree`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PublicEducationLevelService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(PublicEducationLevelService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('récupère l’arbre public et le pousse dans le signal', () => {
    service.load();
    httpMock.expectOne(url).flush(EDUCATION_LEVELS_FIXTURE);

    expect(service.loading()).toBe(false);
    expect(service.tree()).toEqual(EDUCATION_LEVELS_FIXTURE);
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
