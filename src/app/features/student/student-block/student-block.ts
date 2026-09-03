import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { COURSE_RESOURCE_RESOLVER } from '../../../core/course-content/course-content-resolvers';
import { CourseBlock } from '../../../core/courses/course.model';
import { CourseStyleService } from '../../../core/courses/course-style.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { publicCourseLink } from '../../../core/public-courses/public-access';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { CorrectionRequest, ThreadsClearRequest } from '../../../core/student/exercise-correction';
import { StudentSubmissionService } from '../../../core/student/student-submission.service';
import { CourseBlocksView } from '../../../shared/course-blocks-view/course-blocks-view';

/**
 * Un bloc seul (route `blocks/:blockId`, sous l'onglet Sommaire) — la lecture
 * « page à page » du cours : le bloc, sa position (`n / total`) et les liens
 * Précédent / Suivant, plus le retour au sommaire.
 *
 * Le rendu est délégué à `CourseBlocksView` avec un **tableau à un élément** :
 * aucun composant de rendu dédié, et la classe `.course-preview__block` (donc
 * la pagination d'impression) reste celle de la vue partagée.
 *
 * Un bloc exercice s'y **résout** (mode `solve` de `CourseBlocksView` : zones
 * de réponse par question, réponses en localStorage) — c'est la page de
 * résolution, l'ancienne page pleine `exercises/:blockId` y redirige. Le
 * **tuteur IA** y est câblé pour l'élève **connecté** (J5) : `correctionEnabled`
 * suit `AuthService.isAuthenticated()`, les fils viennent de
 * `StudentSubmissionService` (chargés à chaque bloc exercice, imputés à la
 * config IA de l'élève), `correctionRequested` streame un tour,
 * `threadsClearRequested` efface les tours de l'élève (question ou bloc —
 * échec signalé par toast) ; sans session,
 * la vue affiche une invitation à se connecter (retour sur cette page).
 * `AuthService` et le service de soumission sont des services root SANS
 * rendu de contenu : l'invariant « pas de service prof dans la vue élève »
 * porte sur les résolveurs de contenu (`COURSE_*_RESOLVER`), inchangés ici.
 *
 * ⚠ `blockId` est lu sur le **paramMap observé**, jamais en snapshot : passer
 * d'un bloc au suivant réutilise l'instance du composant (motif `DocsShell`),
 * un snapshot resterait figé sur le premier bloc.
 */
@Component({
  selector: 'app-student-block',
  imports: [TranslocoPipe, RouterLink, CourseBlocksView],
  templateUrl: './student-block.html',
  styleUrl: './student-block.scss',
})
export class StudentBlock {
  readonly #courses = inject(PublicCourseService);
  readonly #resolver = inject(COURSE_RESOURCE_RESOLVER);
  readonly #language = inject(LanguageService);
  readonly #route = inject(ActivatedRoute);
  readonly #router = inject(Router);
  readonly #auth = inject(AuthService);
  readonly #submissions = inject(StudentSubmissionService);
  readonly #notifications = inject(NotificationService);
  readonly #transloco = inject(TranslocoService);

  /** Réglages de style du cours — exposés au template (binding `[style]`). */
  protected readonly courseStyle = inject(CourseStyleService);

  /** Ressources publiques sous la forme attendue par la vue de blocs. */
  protected readonly resources = this.#resolver.list;

  readonly #paramMap = toSignal(this.#route.paramMap, {
    initialValue: this.#route.snapshot.paramMap,
  });

  protected readonly blocks = computed<CourseBlock[]>(() => this.#courses.detail()?.blocks ?? []);

  /** Id du cours consulté (présignature des ressources du bloc). */
  protected readonly courseId = computed(() => this.#courses.detail()?.id ?? '');

  /** Bloc demandé — `null` si l'id ne désigne aucun bloc du cours. */
  protected readonly block = computed<CourseBlock | null>(() => {
    const id = this.#paramMap().get('blockId');
    return this.blocks().find((b) => b.id === id) ?? null;
  });

  /** Rang 1-indexé du bloc affiché (0 si inconnu). */
  protected readonly index = computed(() => {
    const block = this.block();
    return block === null ? 0 : this.blocks().indexOf(block) + 1;
  });

  protected readonly previous = computed<CourseBlock | null>(() => this.#neighbour(-1));
  protected readonly next = computed<CourseBlock | null>(() => this.#neighbour(1));

  protected readonly summaryLink = computed(() =>
    publicCourseLink(this.#language.lang(), this.#courses.access()),
  );

  /** Tuteur IA : réservé à l'élève connecté. */
  protected readonly correctionEnabled = computed(() => this.#auth.isAuthenticated());
  protected readonly threads = this.#submissions.threads;

  /** Commandes vers un bloc du cours (citations `oc-block:` des retours du tuteur). */
  protected readonly blockLink = (blockId: string): string[] =>
    publicCourseLink(this.#language.lang(), this.#courses.access(), 'blocks', blockId);

  constructor() {
    // Fils du tuteur : chargés pour chaque bloc exercice affiché à un élève
    // connecté (paramMap observé : le changement de bloc recharge).
    effect(() => {
      const block = this.block();
      const courseId = this.courseId();
      if (!this.correctionEnabled() || block === null || block.type !== 'exercise' || !courseId) {
        return;
      }
      void this.#submissions.loadThreads(courseId, block.id);
    });
  }

  protected blockLinkFor(block: CourseBlock): string[] {
    return this.blockLink(block.id);
  }

  protected onCorrectionRequested(request: CorrectionRequest): void {
    void this.#submissions.submit(this.courseId(), request);
  }

  protected async onThreadsClearRequested(request: ThreadsClearRequest): Promise<void> {
    const ok = await this.#submissions.clearThreads(
      this.courseId(),
      request.blockId,
      request.questionId,
    );
    if (!ok) {
      this.#notifications.error(
        this.#transloco.translate('student.exercise.correction.clearError'),
      );
    }
  }

  /** Connexion depuis la notice du tuteur : retour sur cette page au callback. */
  protected login(): void {
    void this.#auth.login(this.#router.url);
  }

  /** Clic « Suivant » (haut ou bas) : la lecture reprend en haut de la page —
      « Précédent » conserve, lui, la position de défilement. Handler de clic :
      jamais exécuté au SSR, pas de garde plateforme nécessaire. */
  protected scrollToTop(): void {
    window.scrollTo({ top: 0 });
  }

  #neighbour(delta: number): CourseBlock | null {
    const index = this.index();
    return index === 0 ? null : (this.blocks()[index - 1 + delta] ?? null);
  }
}
