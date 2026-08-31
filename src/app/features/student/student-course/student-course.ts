import { Component, computed, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { CourseStyleService } from '../../../core/courses/course-style.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { publicAccessFromRoute, publicCourseLink } from '../../../core/public-courses/public-access';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { Spinner } from '../../../shared/spinner/spinner';

/** Onglets = enfants de route (cf. `PUBLIC_COURSE_CHILDREN` d'`app.routes.ts`). */
type StudentTab = 'blocks' | 'resources' | 'modules' | 'content';

/** Chemin d'enfant → onglet actif ; tout le reste (dont `blocks/:blockId`) = Sommaire. */
const TAB_BY_PATH: Readonly<Record<string, StudentTab>> = {
  resources: 'resources',
  modules: 'modules',
  content: 'content',
};

/**
 * **Coquille** de la vue élève d'un cours partagé (J2) — page publique, sans
 * compte ni Zitadel. Deux régimes, un seul composant (mode lu en snapshot via
 * `data.access`) : lien de partage (`/:lang/shared/:token`) ou cours public
 * direct (`/:lang/p/courses/:courseId`).
 *
 * Elle ne rend que l'**en-tête** (titre, description, chips), la **barre
 * d'onglets** et le `router-outlet` : chaque onglet est une **route enfant**
 * (Sommaire `''` | Ressources | Modules | Cours entier), et le bloc seul vit
 * sous l'onglet Sommaire (`blocks/:blockId`). Motif `DocsShell` : les onglets
 * sont de **vrais liens de navigation** (`<nav>`, pas un tablist APG — il n'y
 * a pas de panneaux à contrôler, ce sont des pages).
 *
 * C'est elle qui **charge le cours** (une fois, elle survit aux changements
 * d'onglet) et applique le style de lecture ; les enfants lisent
 * `PublicCourseService.detail()`. Les pages pleines frères (exercice, module
 * dédié) le rechargent elles-mêmes — `loadCourse` est idempotent.
 *
 * Toute erreur affiche le même message générique : le back répond 404 quel que
 * soit le motif (pas d'oracle).
 *
 * Client-only (`RenderMode.Client`) : markdown-view/DOMPurify/iframe sandbox.
 */
@Component({
  selector: 'app-student-course',
  imports: [TranslocoPipe, RouterLink, RouterOutlet, Spinner],
  templateUrl: './student-course.html',
  styleUrl: './student-course.scss',
})
export class StudentCourse {
  readonly #courses = inject(PublicCourseService);
  readonly #language = inject(LanguageService);
  readonly #route = inject(ActivatedRoute);
  readonly #router = inject(Router);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Réglages de style du cours — chargés ici, appliqués par les enfants. */
  readonly #courseStyle = inject(CourseStyleService);

  /** Régime d'accès de la route (snapshot — la coquille ne change pas de cours). */
  readonly #access = publicAccessFromRoute(this.#route);

  protected readonly detail = this.#courses.detail;
  protected readonly loading = this.#courses.detailLoading;
  /** Accès mal formé ou refusé par le back : même message générique. */
  protected readonly error = computed(
    () => this.#access === null || this.#courses.detailError(),
  );

  /** Une navigation vient d'aboutir — dépendance de recalcul de `activeTab`. */
  readonly #navigated = toSignal(
    this.#router.events.pipe(filter((event) => event instanceof NavigationEnd)),
    { initialValue: null },
  );

  /**
   * Onglet actif, dérivé du chemin de la route enfant. `snapshot.firstChild`
   * n'est pas réactif : c'est `#navigated` qui déclenche la relecture — la
   * coquille survit aux changements d'onglet, aucun re-montage ne le ferait.
   */
  protected readonly activeTab = computed<StudentTab>(() => {
    this.#navigated();
    const path = this.#route.snapshot.firstChild?.routeConfig?.path ?? '';
    return TAB_BY_PATH[path] ?? 'blocks';
  });

  constructor() {
    if (this.#isBrowser && this.#access !== null) {
      void this.#courses.loadCourse(this.#access);
    }
    // Applique le style de lecture enregistré du cours dès que le détail est là.
    effect(() => {
      const detail = this.detail();
      if (detail !== null) {
        this.#courseStyle.load(detail.id, detail.preview_settings);
      }
    });
  }

  /** Commandes du lien d'un onglet (absolues : cf. `publicCourseLink`). */
  protected tabLink(tab: StudentTab): string[] {
    const rest = tab === 'blocks' ? [] : [tab];
    return publicCourseLink(this.#language.lang(), this.#access, ...rest);
  }
}
