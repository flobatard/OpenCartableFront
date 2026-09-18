import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { langFromPath } from '../i18n/language.service';
import { isSuperAdmin } from './user-profile.model';
import { UserProfileService } from './user-profile.service';

/**
 * Barre le backoffice (`/:lang/admin`) à qui n'a pas le rôle de plateforme
 * `super_admin` : redirige vers la home. À placer APRÈS `authGuard` dans
 * `canActivate` (non authentifié → laisse `authGuard` renvoyer au login).
 *
 * **Fail-closed**, à l'inverse d'`onboardingGuard` : si le profil est
 * injoignable, on n'ouvre pas une page d'administration sur un doute. Le vrai
 * barrage reste le 403 des routes `/admin/*` du back — ce guard ne fait
 * qu'éviter d'afficher une page qui n'aurait rien à montrer.
 */
export const superAdminGuard: CanActivateFn = async (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return false;
  }
  const auth = inject(AuthService);
  const profiles = inject(UserProfileService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return true;
  }
  const home = router.createUrlTree(['/', langFromPath(state.url), 'home']);
  try {
    return isSuperAdmin(await profiles.ensureLoaded()) ? true : home;
  } catch {
    return home;
  }
};
