import { Component, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CourseService } from '../../../core/courses/course.service';
import { EducationLevelService } from '../../../core/education-levels/education-level.service';
import {
  findById as findLevelById,
  sortByTreeOrder,
} from '../../../core/education-levels/education-level.utils';
import { LanguageService } from '../../../core/i18n/language.service';
import { SubjectService } from '../../../core/subjects/subject.service';
import { findById as findSubjectById } from '../../../core/subjects/subject.utils';

/**
 * Page « Mes cours » : cartes des cours du prof (badges matières/niveaux,
 * compteur de blocs, dernière modification), entrée vers la création et vers
 * l'espace blocs de chaque cours. La liste est refetchée à chaque entrée sur
 * la page (données mutables). États chargement / erreur / vide soignés,
 * l'état vide étant une invitation à composer le premier cours.
 */
@Component({
  selector: 'app-course-list',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './course-list.html',
  styleUrl: './course-list.scss',
})
export class CourseList {
  readonly #subjects = inject(SubjectService);
  readonly #levels = inject(EducationLevelService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly courses = inject(CourseService);
  protected readonly language = inject(LanguageService);

  constructor() {
    if (this.#isBrowser) {
      this.courses.loadList();
      // Arbres de référence : résolution des noms de badges des cartes.
      this.#subjects.load();
      this.#levels.load();
    }
  }

  protected retry(): void {
    this.courses.loadList();
  }

  /** Noms des matières du cours (id inconnu de l'arbre → pas de chip). */
  protected subjectNames(ids: string[]): string[] {
    return ids
      .map((id) => findSubjectById(this.#subjects.tree(), id)?.nom)
      .filter((nom): nom is string => nom !== undefined);
  }

  /** Noms des niveaux du cours, en ordre d'arbre (id inconnu → pas de chip). */
  protected levelNames(ids: string[]): string[] {
    return sortByTreeOrder(this.#levels.tree(), ids)
      .map((id) => findLevelById(this.#levels.tree(), id)?.nom)
      .filter((nom): nom is string => nom !== undefined);
  }

  /** Date de dernière modification dans la locale de l'UI (pas de DatePipe : locale fr non enregistrée). */
  protected updatedOn(iso: string): string {
    return new Date(iso).toLocaleDateString(this.language.lang());
  }
}
