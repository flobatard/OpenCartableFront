import { Component, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { ResourceService } from '../../../core/resources/resource.service';
import { Spinner } from '../../../shared/spinner/spinner';

/**
 * Cible des liens de ressource des PDF exportés (`resourceContentUrl`) :
 * présigne la lecture inline de manière authentifiée (`getDownloadUrl(...,
 * 'inline')`) puis redirige le navigateur vers l'URL S3. `location.replace`
 * (pas d'entrée d'historique) : le bouton Retour ne boucle pas sur la
 * redirection. Route protégée (authGuard) rendue uniquement côté navigateur
 * (RenderMode.Client) — motif `AuthCallback`.
 */
@Component({
  selector: 'app-resource-view',
  imports: [TranslocoPipe, RouterLink, Spinner],
  template: `
    @if (error(); as reason) {
      <p class="resource-view-message">
        {{ 'courses.resourceView.' + reason | transloco }}
      </p>
      <a [routerLink]="['/', language.lang(), 'courses', courseId]">
        {{ 'courses.resourceView.backToCourse' | transloco }}
      </a>
    } @else {
      <app-spinner size="lg" />
      <p class="resource-view-message" aria-live="polite">
        {{ 'courses.resourceView.opening' | transloco }}
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 48px 24px;
      text-align: center;
    }

    .resource-view-message {
      color: var(--text-secondary);
    }
  `,
})
export class ResourceView implements OnInit {
  readonly #resources = inject(ResourceService);
  readonly #route = inject(ActivatedRoute);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly language = inject(LanguageService);

  // Params en snapshot (convention repo) : la route est une cible de lien
  // externe, jamais réutilisée param à param.
  protected readonly courseId = this.#route.snapshot.paramMap.get('id') ?? '';
  readonly #resourceId = this.#route.snapshot.paramMap.get('resourceId') ?? '';

  readonly error = signal<'notFound' | 'unavailable' | 'error' | null>(null);

  async ngOnInit(): Promise<void> {
    if (!this.#isBrowser) {
      return;
    }
    try {
      const url = await this.#resources.getDownloadUrl(this.courseId, this.#resourceId, 'inline');
      this.redirectTo(url);
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'notFound'
          : error instanceof HttpErrorResponse && error.status === 409
            ? 'unavailable'
            : 'error',
      );
    }
  }

  /**
   * Indirection publique (exception à la convention `protected`) :
   * `location.replace` n'est pas espionnable en jsdom (propriété non
   * redéfinissable), les specs espionnent cette méthode à la place.
   */
  redirectTo(url: string): void {
    window.location.replace(url);
  }
}
