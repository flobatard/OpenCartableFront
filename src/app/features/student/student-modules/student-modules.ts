import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { publicCourseLink } from '../../../core/public-courses/public-access';
import { PublicModuleSummary } from '../../../core/public-courses/public-course.model';
import { PublicModuleResolver } from '../../../core/public-courses/public-content-resolvers';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';

/**
 * Onglet « Modules » de la vue élève (route `modules`) — bibliothèque de
 * modules interactifs du cours, en lecture seule. Pendant public de
 * `CourseModules` sans aucune mutation (ni création, ni renommage, ni
 * suppression).
 *
 * C'est un **index** : chaque entrée mène à la page dédiée du module
 * (`modules/:moduleId`), qui l'exécute en pleine largeur — rien n'est monté
 * ici, donc aucune iframe sandbox n'est créée tant qu'on n'ouvre pas un
 * module. La liste (titres seuls) arrive avec le détail public déjà chargé
 * par la coquille : aucune requête.
 */
@Component({
  selector: 'app-student-modules',
  imports: [TranslocoPipe, RouterLink],
  templateUrl: './student-modules.html',
  styleUrl: './student-modules.scss',
})
export class StudentModules {
  readonly #courses = inject(PublicCourseService);
  readonly #modules = inject(PublicModuleResolver);
  readonly #language = inject(LanguageService);

  /** Modules du cours, déjà triés par le back. */
  protected readonly modules = this.#modules.list;

  protected moduleLink(module: PublicModuleSummary): string[] {
    return publicCourseLink(this.#language.lang(), this.#courses.access(), 'modules', module.id);
  }
}
