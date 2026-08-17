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
  /** Contexte — réservés au câblage IA, passés dès maintenant. Deux hôtes :
      le block-editor (courseId + blockId) et le module-editor (courseId +
      moduleId) ; seul le cours est toujours connu. */
  readonly courseId = input.required<string>();
  readonly blockId = input<string | null>(null);
  readonly moduleId = input<string | null>(null);

  /** Demande de repli du panneau ; l'hôte (block/module-editor) pilote l'affichage. */
  readonly collapse = output<void>();
}
