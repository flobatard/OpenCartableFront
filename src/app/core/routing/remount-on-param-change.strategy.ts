import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, BaseRouteReuseStrategy } from '@angular/router';

/** Clé de `data` de route qui active le remontage sur changement de params. */
export const REMOUNT_ON_PARAM_CHANGE = 'remountOnParamChange';

/**
 * Stratégie de réutilisation des routes : comportement Angular par défaut,
 * SAUF pour les routes marquées `data: { remountOnParamChange: true }` —
 * naviguer vers la même route avec d'autres params y détruit et remonte le
 * composant (le `ngOnDestroy` — flush d'autosave — puis l'init tournent).
 *
 * Raison d'être : les pages d'édition (`courses/:id/blocks/:blockId`,
 * `courses/:id/modules/:moduleId`) lisent leurs params en **snapshot**
 * (convention du projet) ; or une citation `oc-block:` du panneau assistant
 * peut naviguer d'un éditeur de bloc vers un autre — sans cette stratégie,
 * l'instance serait réutilisée avec un `blockId` périmé. Les composants
 * conçus pour survivre à un changement de param (`DocsShell`, `StudentBlock`)
 * ne posent pas le flag et gardent le comportement par défaut. Un changement
 * de query params seuls (ex. `?tab=`) ne remonte jamais rien.
 */
@Injectable()
export class RemountOnParamChangeStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    if (future.routeConfig !== curr.routeConfig) {
      return false;
    }
    if (!future.routeConfig?.data?.[REMOUNT_ON_PARAM_CHANGE]) {
      return true;
    }
    return sameParams(future.params, curr.params);
  }
}

function sameParams(a: Record<string, string>, b: Record<string, string>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((key) => a[key] === b[key]);
}
