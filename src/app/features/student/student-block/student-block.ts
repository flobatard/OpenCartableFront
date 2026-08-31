import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { COURSE_RESOURCE_RESOLVER } from '../../../core/course-content/course-content-resolvers';
import { CourseBlock } from '../../../core/courses/course.model';
import { CourseStyleService } from '../../../core/courses/course-style.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { publicCourseLink } from '../../../core/public-courses/public-access';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
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

  protected blockLink(block: CourseBlock): string[] {
    return publicCourseLink(this.#language.lang(), this.#courses.access(), 'blocks', block.id);
  }

  /** CTA « Résoudre l'exercice » : page pleine dédiée, même régime d'accès. */
  protected readonly exerciseLink = (blockId: string): string[] =>
    publicCourseLink(this.#language.lang(), this.#courses.access(), 'exercises', blockId);

  #neighbour(delta: number): CourseBlock | null {
    const index = this.index();
    return index === 0 ? null : (this.blocks()[index - 1 + delta] ?? null);
  }
}
