import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { langFromPath } from '../i18n/language.service';
import { UserProfileService } from './user-profile.service';

/**
 * Barre les routes protégées tant que l'onboarding n'est pas terminé :
 * redirige vers `/:lang/onboarding?next=<url visée>`. À placer APRÈS
 * `authGuard` dans `canActivate` (non authentifié → laisse `authGuard`
 * décider) et JAMAIS sur la route onboarding elle-même (boucle).
 *
 * Fail-open : si le profil est injoignable (API down), on laisse passer —
 * la page visée affichera son propre état d'erreur, plutôt que d'enfermer
 * l'utilisateur hors de l'app.
 */
export const onboardingGuard: CanActivateFn = async (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return false;
  }
  const auth = inject(AuthService);
  const profiles = inject(UserProfileService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return true;
  }
  try {
    const profile = await profiles.ensureLoaded();
    if (profile.onboarding_complete) {
      return true;
    }
    return router.createUrlTree(['/', langFromPath(state.url), 'onboarding'], {
      queryParams: { next: state.url },
    });
  } catch {
    return true;
  }
};
