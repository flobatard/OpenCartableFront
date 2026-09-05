import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PublicCourseSummary } from '../../core/public-courses/public-course.model';

/**
 * Carte d'un cours public, partagée par le catalogue d'un prof et les
 * résultats de recherche.
 *
 * Présentational pur : les chips matières/niveaux sont déjà des **noms**
 * dénormalisés par le back (contrat public), aucune résolution d'arbre ; le
 * lien est calculé par l'hôte (catalogue et recherche pointent tous deux
 * `/:lang/p/courses/:id`). La grille reste dans les hôtes — la carte ne
 * s'occupe que d'elle-même.
 */
@Component({
  selector: 'app-public-course-card',
  imports: [TranslocoPipe, RouterLink],
  templateUrl: './public-course-card.html',
  styleUrl: './public-course-card.scss',
})
export class PublicCourseCard {
  readonly course = input.required<PublicCourseSummary>();
  /** Segments routerLink de la cible « Ouvrir le cours ». */
  readonly link = input.required<unknown[]>();
}
