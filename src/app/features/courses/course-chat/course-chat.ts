import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Panneau assistant IA du cours — coquille présentationnelle. L'IA n'est pas
 * encore branchée : la zone de messages montre un état vide et la saisie est
 * désactivée. La structure (en-tête / liste `log` / composer) est définitive ;
 * le câblage futur (service + signal `messages`, `send()`) sera purement additif.
 */
@Component({
  selector: 'app-course-chat',
  imports: [TranslocoPipe],
  templateUrl: './course-chat.html',
  styleUrl: './course-chat.scss',
})
export class CourseChat {
  /** Contexte du cours — réservés au câblage IA, passés dès maintenant. */
  readonly courseId = input.required<string>();
  readonly blockId = input.required<string>();

  /** Demande de repli du panneau ; le parent (block-editor) pilote l'affichage. */
  readonly collapse = output<void>();
}
