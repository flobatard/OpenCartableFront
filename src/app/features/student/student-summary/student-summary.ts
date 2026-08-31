import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CourseBlock } from '../../../core/courses/course.model';
import { LanguageService } from '../../../core/i18n/language.service';
import { publicCourseLink } from '../../../core/public-courses/public-access';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';

/**
 * Onglet « Sommaire » de la vue élève (route `''` sous la coquille) — table
 * des matières du cours : une entrée par bloc (numéro, titre, description,
 * badge de type) menant à sa page `blocks/:blockId`.
 *
 * Présentational + service : le détail est déjà chargé par la coquille, on ne
 * refait aucune requête. Le régime d'accès vient de `PublicCourseService`
 * (`access`) et non de `data.access` : la route parente porte un composant,
 * l'héritage de `data` est coupé.
 */
@Component({
  selector: 'app-student-summary',
  imports: [TranslocoPipe, RouterLink],
  templateUrl: './student-summary.html',
  styleUrl: './student-summary.scss',
})
export class StudentSummary {
  readonly #courses = inject(PublicCourseService);
  readonly #language = inject(LanguageService);

  protected readonly blocks = computed<CourseBlock[]>(() => this.#courses.detail()?.blocks ?? []);

  /** Rang 1-indexé du bloc (numéro affiché et repli « Partie n »). */
  protected blockNumber(block: CourseBlock): number {
    return this.blocks().indexOf(block) + 1;
  }

  protected blockLink(block: CourseBlock): string[] {
    return publicCourseLink(this.#language.lang(), this.#courses.access(), 'blocks', block.id);
  }
}
