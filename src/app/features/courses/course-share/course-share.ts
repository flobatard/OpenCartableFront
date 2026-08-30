import { Component, computed, effect, inject, input, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { environment } from '../../../../environments/environment';
import { CourseService } from '../../../core/courses/course.service';
import { CourseVisibility } from '../../../core/courses/course.model';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ShareLink } from '../../../core/share/share-link.model';
import { ShareLinkService } from '../../../core/share/share-link.service';
import { UserProfileService } from '../../../core/users/user-profile.service';

/** Ordre d'affichage des trois régimes (cartes radio). */
const VISIBILITIES: readonly CourseVisibility[] = ['draft', 'private', 'public'];

/**
 * Onglet « Partage » de la page cours (J2) : régime d'accès élève du cours
 * (trois cartes radio — En cours de rédaction / Lien privé / Public — PUT
 * immédiat ; l'état affiché dérive du signal `detail`, un échec le laisse
 * donc inchangé) et gestion des liens de partage (création avec libellé
 * optionnel, copie de l'URL, expiration affichée, révocation en deux temps
 * désarmée au blur, révoqués listés atténués).
 *
 * Les URL sont construites ici (`siteUrl` + langue active) : lien élève
 * `/:lang/shared/:token`, catalogue public `/:lang/p/:profileId` (l'id vient
 * du profil — affiché quand le cours est `public`).
 */
@Component({
  selector: 'app-course-share',
  imports: [TranslocoPipe],
  templateUrl: './course-share.html',
  styleUrl: './course-share.scss',
})
export class CourseShare {
  readonly #courses = inject(CourseService);
  readonly #links = inject(ShareLinkService);
  readonly #profile = inject(UserProfileService);
  readonly #notifications = inject(NotificationService);
  readonly #transloco = inject(TranslocoService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly language = inject(LanguageService);

  readonly courseId = input.required<string>();

  protected readonly visibilities = VISIBILITIES;

  /** Régime courant — dérivé du détail (source de vérité, pas d'état local). */
  protected readonly visibility = computed<CourseVisibility>(
    () => this.#courses.detail()?.visibility ?? 'draft',
  );
  protected readonly visibilityBusy = signal(false);
  protected readonly visibilityError = signal(false);

  protected readonly links = this.#links.list;
  protected readonly linksLoading = this.#links.listLoading;
  protected readonly linksError = this.#links.listError;

  /** Libellé du prochain lien (saisie libre, optionnelle). */
  protected readonly label = signal('');
  protected readonly creating = signal(false);
  protected readonly createError = signal(false);

  /** Lien « armé » pour révocation (le 2e clic confirme). */
  protected readonly pendingRevoke = signal<string | null>(null);
  protected readonly revokeError = signal(false);

  /** URL du catalogue public du prof (affichée quand le cours est `public`). */
  protected readonly catalogUrl = computed(() => {
    const profile = this.#profile.profile();
    return profile === null
      ? null
      : `${environment.siteUrl}/${this.language.lang()}/p/${profile.id}`;
  });

  constructor() {
    effect(() => {
      const courseId = this.courseId();
      if (this.#isBrowser) {
        this.#links.loadList(courseId);
      }
    });
    if (this.#isBrowser) {
      // L'id du profil sert au lien du catalogue ; déjà chargé par le guard
      // d'onboarding en pratique (promesse partagée, zéro requête en plus).
      void this.#profile.ensureLoaded().catch(() => undefined);
    }
  }

  protected reloadLinks(): void {
    this.#links.loadList(this.courseId());
  }

  /** Change le régime d'accès (PUT immédiat ; l'affichage suit le signal). */
  protected async setVisibility(visibility: CourseVisibility): Promise<void> {
    if (this.visibilityBusy() || this.visibility() === visibility) {
      return;
    }
    this.visibilityBusy.set(true);
    this.visibilityError.set(false);
    try {
      await this.#courses.updateVisibility(this.courseId(), visibility);
    } catch {
      this.visibilityError.set(true);
    } finally {
      this.visibilityBusy.set(false);
    }
  }

  /** URL élève complète d'un lien de partage (capability URL). */
  protected shareUrl(link: ShareLink): string {
    return `${environment.siteUrl}/${this.language.lang()}/shared/${link.token}`;
  }

  /** Copie une URL dans le presse-papiers, avec toast de confirmation. */
  protected async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.#notifications.success(this.#transloco.translate('courses.share.copied'));
    } catch {
      this.#notifications.error(this.#transloco.translate('courses.share.copyError'));
    }
  }

  /** Crée un lien avec le libellé saisi (optionnel), vidé après coup. */
  protected async create(): Promise<void> {
    if (this.creating()) {
      return;
    }
    this.creating.set(true);
    this.createError.set(false);
    try {
      await this.#links.createLink(this.courseId(), this.label());
      this.label.set('');
    } catch {
      this.createError.set(true);
    } finally {
      this.creating.set(false);
    }
  }

  /** Révoque un lien (deux temps : premier clic arme, second confirme). */
  protected async revoke(link: ShareLink): Promise<void> {
    if (this.pendingRevoke() !== link.id) {
      this.pendingRevoke.set(link.id);
      return;
    }
    this.pendingRevoke.set(null);
    this.revokeError.set(false);
    try {
      await this.#links.revokeLink(this.courseId(), link.id);
    } catch {
      this.revokeError.set(true);
    }
  }

  /** Quitter le bouton armé (focus ailleurs) annule la révocation. */
  protected disarmRevoke(): void {
    this.pendingRevoke.set(null);
  }

  /** Date d'expiration lisible dans la langue active. */
  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(this.language.lang());
  }

  /** Vrai si le lien est expiré (affiché atténué, comme un révoqué). */
  protected isExpired(link: ShareLink): boolean {
    return new Date(link.expires_at).getTime() <= Date.now();
  }
}
