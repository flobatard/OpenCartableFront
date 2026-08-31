import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { AssistantPanel } from './assistant-panel';

/**
 * `/:lang/courses/:id[/…]` de l'espace prof — jamais `courses/new` (segment
 * littéral, pas un id) ni les pages publiques `/p/courses/…` (le préfixe `p/`
 * ne matche pas). Charset restreint : l'id extrait finit interpolé dans les
 * URL de l'API assistant (garde de forme, motif `isModuleId`).
 */
const COURSE_URL_PATTERN = /^\/[a-z]{2}\/courses\/([A-Za-z0-9-]+)(?:[/?#;]|$)/;

/** Id du cours de l'URL d'autorat courante, ou `null` hors espace cours. */
export function courseIdFromUrl(url: string): string | null {
  const id = COURSE_URL_PATTERN.exec(url)?.[1] ?? null;
  return id !== null && id !== 'new' ? id : null;
}

/**
 * Hôte UNIQUE du panneau assistant flottant, monté dans le shell `App` (hors
 * du `router-outlet`, motif `app-snackbar`) : le cours courant est dérivé de
 * l'URL (`NavigationEnd`), pas du montage des pages — l'instance du panneau
 * (et son DOM : fil affiché, scroll, saisie en cours) **survit donc aux
 * navigations** entre la page cours et les éditeurs de bloc/module, sans
 * flash de remontage. Quitter l'espace du cours démonte le panneau (le
 * `@if`) ; l'état vit de toute façon dans `CourseAssistantService`.
 *
 * Le `@defer` (premier du projet) garde la chaîne du chat (markdown-view →
 * marked/KaTeX/DOMPurify…) HORS du bundle initial : `App` est eager, le
 * panneau ne se charge qu'à la première entrée authentifiée dans un cours.
 */
@Component({
  selector: 'app-assistant-outlet',
  imports: [AssistantPanel],
  templateUrl: './assistant-outlet.html',
})
export class AssistantOutlet {
  readonly #auth = inject(AuthService);
  readonly #router = inject(Router);

  readonly #url = toSignal(
    this.#router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.#router.url),
    ),
    { initialValue: this.#router.url },
  );

  /** Les pages cours sont toutes derrière `authGuard` — ceinture et bretelles. */
  protected readonly courseId = computed(() =>
    this.#auth.isAuthenticated() ? courseIdFromUrl(this.#url()) : null,
  );
}
