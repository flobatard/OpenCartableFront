import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { vi } from 'vitest';
import {
  USER_PROFILE_ONBOARDED_FIXTURE,
  USER_PROFILE_SUPER_ADMIN_FIXTURE,
} from '../../testing/user-profile.fixture';
import { AuthService } from '../auth/auth.service';
import { superAdminGuard } from './super-admin.guard';
import { UserProfileService } from './user-profile.service';

describe('superAdminGuard', () => {
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
      superAdminGuard({} as ActivatedRouteSnapshot, { url: stateUrl } as RouterStateSnapshot),
    );
  }

  beforeEach(() => {
    isAuthenticated = signal(true);
    ensureLoaded = vi.fn();
  });

  it('returns false during server rendering', async () => {
    configure('server');
    expect(await runGuard('/fr/admin/jobs')).toBe(false);
  });

  it('lets an unauthenticated user through (upstream authGuard decides)', async () => {
    isAuthenticated.set(false);
    configure();
    expect(await runGuard('/fr/admin/jobs')).toBe(true);
    expect(ensureLoaded).not.toHaveBeenCalled();
  });

  it('lets a super admin through', async () => {
    ensureLoaded.mockResolvedValue(USER_PROFILE_SUPER_ADMIN_FIXTURE);
    configure();
    expect(await runGuard('/fr/admin/jobs')).toBe(true);
  });

  it('sends a public account back to the home of its language', async () => {
    ensureLoaded.mockResolvedValue(USER_PROFILE_ONBOARDED_FIXTURE);
    configure();
    const result = await runGuard('/en/admin/jobs');
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/en/home');
  });

  it('stays closed when the profile is unreachable (fail-closed)', async () => {
    ensureLoaded.mockRejectedValue(new Error('down'));
    configure();
    const result = await runGuard('/fr/admin');
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/fr/home');
  });
});
