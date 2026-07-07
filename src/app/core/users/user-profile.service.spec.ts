import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { USER_PROFILE_FIXTURE } from '../../testing/user-profile.fixture';
import { AuthService } from '../auth/auth.service';
import { OnboardingPayload } from './user-profile.model';
import { UserProfileService } from './user-profile.service';

describe('UserProfileService', () => {
  let service: UserProfileService;
  let httpMock: HttpTestingController;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  const url = `${environment.apiUrl}/v1/users/me`;

  beforeEach(() => {
    isAuthenticated = signal(true);
    TestBed.configureTestingModule({
      providers: [
        UserProfileService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: isAuthenticated.asReadonly() } },
      ],
    });
    service = TestBed.inject(UserProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('ne fait qu’un seul GET pour deux ensureLoaded() concurrents', async () => {
    const first = service.ensureLoaded();
    const second = service.ensureLoaded();
    httpMock.expectOne(url).flush(USER_PROFILE_FIXTURE);

    expect(await first).toEqual(USER_PROFILE_FIXTURE);
    expect(await second).toEqual(USER_PROFILE_FIXTURE);
    expect(service.profile()).toEqual(USER_PROFILE_FIXTURE);
  });

  it('resert le profil déjà chargé sans nouvel appel réseau', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).flush(USER_PROFILE_FIXTURE);
    await first;

    expect(await service.ensureLoaded()).toEqual(USER_PROFILE_FIXTURE);
    httpMock.verify(); // échouerait s'il y avait une seconde requête
  });

  it('invalide la requête en vol sur erreur : le retry refait un GET', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).error(new ProgressEvent('network'));
    await expect(first).rejects.toBeTruthy();

    const retry = service.ensureLoaded();
    httpMock.expectOne(url).flush(USER_PROFILE_FIXTURE);
    expect(await retry).toEqual(USER_PROFILE_FIXTURE);
  });

  it('submitOnboarding fait un PUT et remplace le signal', async () => {
    const payload: OnboardingPayload = {
      est_prof: true,
      est_eleve: false,
      systeme_scolaire: 'fr',
      enseignement: { education_level_ids: ['lvl-1'], subject_ids: ['sub-1'] },
      apprentissage: null,
    };
    const updated = { ...USER_PROFILE_FIXTURE, onboarding_complete: true };

    const submit = service.submitOnboarding(payload);
    const req = httpMock.expectOne(`${url}/onboarding`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush(updated);

    expect(await submit).toEqual(updated);
    expect(service.profile()).toEqual(updated);
    expect(service.onboardingComplete()).toBe(true);
  });

  it('purge le profil quand la session tombe', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).flush(USER_PROFILE_FIXTURE);
    await first;
    expect(service.profile()).not.toBeNull();

    isAuthenticated.set(false);
    TestBed.tick(); // flush de l'effect de purge

    expect(service.profile()).toBeNull();
  });
});
