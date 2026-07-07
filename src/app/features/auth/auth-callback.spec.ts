import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { UserProfileService } from '../../core/users/user-profile.service';
import {
  USER_PROFILE_FIXTURE,
  USER_PROFILE_ONBOARDED_FIXTURE,
} from '../../testing/user-profile.fixture';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { AuthCallback } from './auth-callback';

describe('AuthCallback', () => {
  let completeLogin: ReturnType<typeof vi.fn>;
  let ensureLoaded: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  async function createComponent() {
    await TestBed.configureTestingModule({
      imports: [AuthCallback, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { completeLogin } },
        { provide: UserProfileService, useValue: { ensureLoaded } },
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true) as ReturnType<
      typeof vi.fn
    >;
    const fixture = TestBed.createComponent(AuthCallback);
    await fixture.componentInstance.ngOnInit();
    return fixture;
  }

  beforeEach(() => {
    completeLogin = vi.fn().mockResolvedValue('/fr/subjects');
    ensureLoaded = vi.fn();
  });

  it('navigue vers la cible quand le profil est onboardé', async () => {
    ensureLoaded.mockResolvedValue(USER_PROFILE_ONBOARDED_FIXTURE);
    await createComponent();

    expect(navigateByUrl).toHaveBeenCalledWith('/fr/subjects', { replaceUrl: true });
  });

  it('redirige vers l’onboarding (avec next) quand le profil est incomplet', async () => {
    ensureLoaded.mockResolvedValue(USER_PROFILE_FIXTURE);
    completeLogin.mockResolvedValue('/en/subjects');
    await createComponent();

    const [url] = navigateByUrl.mock.calls[0];
    expect(url).toBeInstanceOf(UrlTree);
    expect((url as UrlTree).toString()).toContain('/en/onboarding');
    expect((url as UrlTree).queryParams['next']).toBe('/en/subjects');
  });

  it('fail-open : navigue vers la cible si le profil est injoignable', async () => {
    ensureLoaded.mockRejectedValue(new Error('down'));
    await createComponent();

    expect(navigateByUrl).toHaveBeenCalledWith('/fr/subjects', { replaceUrl: true });
  });

  it('affiche l’erreur si l’échange du code échoue', async () => {
    completeLogin.mockRejectedValue(new Error('bad code'));
    const fixture = await createComponent();

    expect(fixture.componentInstance.error()).toBe(true);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
