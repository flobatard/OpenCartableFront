import { Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import {
  publicAccessFromRoute,
  publicCourseLink,
} from '../../../core/public-courses/public-access';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { ModuleEmbed } from '../../../shared/module-runner/module-embed';
import { Spinner } from '../../../shared/spinner/spinner';

/**
 * **Page dédiée d'un module interactif** (`.../modules/:moduleId`) — le prof y
 * renvoie pour démontrer un module seul : pas d'en-tête de cours à onglets,
 * juste le titre du module et son exécution en pleine largeur.
 *
 * Page pleine, sœur de la coquille (et non son enfant) : elle
 * lit donc `data.access` de la route (héritage depuis le parent componentless)
 * et charge le cours elle-même — `loadCourse` est idempotent, arriver ici
 * depuis l'onglet Modules ne refait aucune requête. Le titre vient de la
 * bibliothèque embarquée dans le détail ; le **code** est résolu par
 * `ModuleEmbed` via `COURSE_MODULE_RESOLVER` (impl. publique, sans Bearer) et
 * s'exécute dans l'iframe sandbox à origine opaque habituelle.
 *
 * Client-only (`RenderMode.Client`) : iframe sandbox.
 */
@Component({
  selector: 'app-student-module',
  imports: [TranslocoPipe, RouterLink, ModuleEmbed, Spinner],
  templateUrl: './student-module.html',
  styleUrl: './student-module.scss',
})
export class StudentModule {
  readonly #courses = inject(PublicCourseService);
  readonly #route = inject(ActivatedRoute);
  readonly #language = inject(LanguageService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Params en snapshot (convention repo) : cible de lien externe.
  readonly #access = publicAccessFromRoute(this.#route);
  protected readonly moduleId = this.#route.snapshot.paramMap.get('moduleId') ?? '';

  protected readonly loading = this.#courses.detailLoading;
  /** Cours introuvable/refusé : même message générique (pas d'oracle). */
  protected readonly error = computed(
    () => this.#access === null || this.#courses.detailError(),
  );

  protected readonly courseId = computed(() => this.#courses.detail()?.id ?? '');

  /** Le module existe-t-il dans la bibliothèque du cours ? */
  protected readonly module = computed(
    () => this.#courses.detail()?.modules.find((m) => m.id === this.moduleId) ?? null,
  );

  protected readonly courseLink = computed(() =>
    publicCourseLink(this.#language.lang(), this.#access),
  );
  protected readonly modulesLink = computed(() =>
    publicCourseLink(this.#language.lang(), this.#access, 'modules'),
  );

  constructor() {
    if (this.#isBrowser && this.#access !== null) {
      void this.#courses.loadCourse(this.#access);
    }
  }
}
