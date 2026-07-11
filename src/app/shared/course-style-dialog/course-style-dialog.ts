import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { COURSE_STYLE_BOUNDS, CourseStyleService } from '../../core/courses/course-style.service';

/** Compteur de module : ids ARIA uniques par instance (jamais Date.now/Math.random). */
let uid = 0;

/**
 * Modale de réglage du style de rendu markdown d'un cours (taille de texte, des
 * titres, interligne, largeur, espacement, police). Élément `<dialog>` natif :
 * focus-trap, Escape et backdrop gérés par la plateforme. Présentational —
 * pilotée par le parent via `open()` / `close()`.
 *
 * Édite en direct le `CourseStyleService` (cours courant) : chaque changement se
 * reflète immédiatement dans le rendu derrière la modale (variables scopées au
 * conteneur). Placée dans `shared/` car montée par `markdown-view` (shared) —
 * elle injecte un service `core` comme `markdown-view` injecte `ResourceService`.
 */
@Component({
  selector: 'app-course-style-dialog',
  imports: [TranslocoPipe],
  templateUrl: './course-style-dialog.html',
  styleUrl: './course-style-dialog.scss',
})
export class CourseStyleDialog {
  /** viewChild sur champ `protected` (jamais `#`) ; ref `dialogEl` (≠ signal `dialog`). */
  protected readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  /** Source de vérité + bornes des curseurs, exposées au template. */
  protected readonly service = inject(CourseStyleService);
  protected readonly bounds = COURSE_STYLE_BOUNDS;

  /** Id unique du titre (plusieurs instances de la modale coexistent au DOM). */
  protected readonly titleId = `course-style-title-${(uid += 1)}`;

  open(): void {
    this.dialog()?.nativeElement.showModal();
  }

  close(): void {
    this.dialog()?.nativeElement.close();
  }

  /** Clic sur le fond : le backdrop d'un `<dialog>` cible l'élément lui-même. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.close();
    }
  }

  /** Valeur numérique d'un `<input type="range">` (évite `$any` dans le template). */
  protected readNumber(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  /** Pourcentage arrondi (affichage de la taille des titres). */
  protected percent(scale: number): string {
    return `${Math.round(scale * 100)} %`;
  }
}
