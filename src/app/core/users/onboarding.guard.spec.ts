import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot, UrlTree } from '@angular/router';
import { vi } from 'vitest';
import {
  USER_PROFILE_FIXTURE,
  USER_PROFILE_ONBOARDED_FIXTURE,
} from '../../testing/user-profile.fixture';
import { AuthService } from '../auth/auth.service';
import { onboardingGuard } from './onboarding.guard';
import { UserProfileService } from './user-profile.service';

describe('onboardingGuard', () => {
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  let ensureLoaded: ReturnType<typeof vi.fn>;

  function configure(platformId: 'browser' | 'server' = 'browser'): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platformId },
        { provide: AuthService, useValue: { isAuthenticated: isAuthenticated.asReadonly() } },
        { provide: UserProfileService, useValue: { ensureLoaded } },
      ],
    });
  }

  function runGuard(stateUrl: string) {
    return TestBed.runInInjectionContext(() =>
      onboardingGuard({} as ActivatedRouteSnapshot, { url: stateUrl } as RouterStateSnapshot),
    );
  }

  beforeEach(() => {
    isAuthenticated = signal(true);
    ensureLoaded = vi.fn();
  });

  it('returns false during server rendering', async () => {
    configure('server');
    expect(await runGuard('/fr/subjects')).toBe(false);
  });

  it('lets an unauthenticated user through (upstream authGuard decides)', async () => {
    isAuthenticated.set(false);
    configure();
    expect(await runGuard('/fr/subjects')).toBe(true);
    expect(ensureLoaded).not.toHaveBeenCalled();
  });

  it('lets an onboarded profile through', async () => {
    ensureLoaded.mockResolvedValue(USER_PROFILE_ONBOARDED_FIXTURE);
    configure();
    expect(await runGuard('/fr/subjects')).toBe(true);
  });

  it('redirects an incomplete profile to the onboarding with next', async () => {
    ensureLoaded.mockResolvedValue(USER_PROFILE_FIXTURE);
    configure();
    const result = await runGuard('/en/subjects');
    expect(result).toBeInstanceOf(UrlTree);
    const tree = result as UrlTree;
    expect(tree.toString()).toContain('/en/onboarding');
    expect(tree.queryParams['next']).toBe('/en/subjects');
  });

  it('lets through when the profile is unreachable (fail-open)', async () => {
    ensureLoaded.mockRejectedValue(new Error('down'));
    configure();
    expect(await runGuard('/fr/subjects')).toBe(true);
  });
});
