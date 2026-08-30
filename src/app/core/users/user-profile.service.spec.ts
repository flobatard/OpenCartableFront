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

  it('issues a single GET for two concurrent ensureLoaded() calls', async () => {
    const first = service.ensureLoaded();
    const second = service.ensureLoaded();
    httpMock.expectOne(url).flush(USER_PROFILE_FIXTURE);

    expect(await first).toEqual(USER_PROFILE_FIXTURE);
    expect(await second).toEqual(USER_PROFILE_FIXTURE);
    expect(service.profile()).toEqual(USER_PROFILE_FIXTURE);
  });

  it('serves the already loaded profile again without a new network call', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).flush(USER_PROFILE_FIXTURE);
    await first;

    expect(await service.ensureLoaded()).toEqual(USER_PROFILE_FIXTURE);
    httpMock.verify(); // échouerait s'il y avait une seconde requête
  });

  it('invalidates the in-flight request on error: the retry issues a new GET', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).error(new ProgressEvent('network'));
    await expect(first).rejects.toBeTruthy();

    const retry = service.ensureLoaded();
    httpMock.expectOne(url).flush(USER_PROFILE_FIXTURE);
    expect(await retry).toEqual(USER_PROFILE_FIXTURE);
  });

  it('saveProfile PUTs and replaces the signal', async () => {
    const payload: OnboardingPayload = {
      is_teacher: true,
      is_student: false,
      school_system: 'fr',
      public_name: null,
      searchable: false,
      teaching: { education_level_ids: ['lvl-1'], subject_ids: ['sub-1'] },
      learning: null,
    };
    const updated = { ...USER_PROFILE_FIXTURE, onboarding_complete: true };

    const submit = service.saveProfile(payload);
    const req = httpMock.expectOne(`${url}/profile`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush(updated);

    expect(await submit).toEqual(updated);
    expect(service.profile()).toEqual(updated);
    expect(service.onboardingComplete()).toBe(true);
  });

  it('clears the profile when the session drops', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).flush(USER_PROFILE_FIXTURE);
    await first;
    expect(service.profile()).not.toBeNull();

    isAuthenticated.set(false);
    TestBed.tick(); // flush de l'effect de purge

    expect(service.profile()).toBeNull();
  });

  describe('avatar', () => {
    const blob = () => new Blob(['x'.repeat(10)], { type: 'image/jpeg' });

    it('uploadAvatar chains presign → S3 PUT without implicit Bearer → confirm', async () => {
      const updated = { ...USER_PROFILE_FIXTURE, avatar_url: 'https://s3.test/get/a.jpg' };
      const upload = service.uploadAvatar(blob());

      const presign = httpMock.expectOne(`${url}/avatar`);
      expect(presign.request.method).toBe('POST');
      expect(presign.request.body).toEqual({ mime: 'image/jpeg', size: 10 });
      presign.flush({ upload_url: 'https://s3.test/put/a.jpg', expires_in: 900 });
      await Promise.resolve(); // laisse la promesse enchaîner sur le PUT

      const put = httpMock.expectOne('https://s3.test/put/a.jpg');
      expect(put.request.method).toBe('PUT');
      // Content-Type strictement le mime déclaré (figé dans la signature S3).
      expect(put.request.headers.get('Content-Type')).toBe('image/jpeg');
      expect(service.avatarState().phase).toBe('uploading');
      put.flush('');
      await Promise.resolve();

      const confirm = httpMock.expectOne(`${url}/avatar/confirm`);
      expect(confirm.request.method).toBe('POST');
      confirm.flush(updated);

      expect(await upload).toEqual(updated);
      expect(service.profile()).toEqual(updated); // la réponse remplace le signal
      expect(service.avatarState()).toEqual({ phase: 'idle', progress: 0 });
    });

    it('locally rejects a blob above the cap, without any request', async () => {
      const oversized = new Blob([new ArrayBuffer(5_242_881)], { type: 'image/jpeg' });
      await expect(service.uploadAvatar(oversized)).rejects.toBeTruthy();
      expect(service.avatarState().phase).toBe('error');
      httpMock.verify(); // aucun appel réseau
    });

    it('switches to error when the presign fails', async () => {
      const upload = service.uploadAvatar(blob());
      httpMock.expectOne(`${url}/avatar`).error(new ProgressEvent('network'));
      await expect(upload).rejects.toBeTruthy();
      expect(service.avatarState().phase).toBe('error');
    });

    it('deleteAvatar DELETEs and replaces the signal', async () => {
      const updated = { ...USER_PROFILE_FIXTURE, avatar_url: null };
      const removal = service.deleteAvatar();
      const req = httpMock.expectOne(`${url}/avatar`);
      expect(req.request.method).toBe('DELETE');
      req.flush(updated);

      expect(await removal).toEqual(updated);
      expect(service.profile()).toEqual(updated);
      expect(service.avatarState()).toEqual({ phase: 'idle', progress: 0 });
    });

    it('clears the avatar state when the session drops', async () => {
      const upload = service.uploadAvatar(blob());
      expect(service.avatarState().phase).toBe('presigning');
      httpMock.expectOne(`${url}/avatar`).error(new ProgressEvent('network'));
      await expect(upload).rejects.toBeTruthy();
      expect(service.avatarState().phase).toBe('error');

      isAuthenticated.set(false);
      TestBed.tick();

      expect(service.avatarState()).toEqual({ phase: 'idle', progress: 0 });
    });
  });
});
