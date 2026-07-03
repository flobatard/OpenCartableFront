import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Protège les routes réservées au prof : redirige vers l'IdP si nécessaire.
 * Les routes protégées ne sont jamais résolues authentifiées au rendu serveur.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return false;
  }
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) {
    return true;
  }
  void auth.login(state.url);
  return false;
};
