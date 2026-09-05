import { Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CourseAssistantService } from '../../../core/course-assistant/course-assistant.service';
import { CourseChat } from '../course-chat/course-chat';

/**
 * Hôte flottant de l'assistant du cours (contexte global) — épinglé au
 * viewport en bas à droite (`position: fixed` : il survit au scroll),
 * repliable en pilule « Assistant ». Monté UNE seule fois, par
 * `AssistantOutlet` dans le shell `App` : l'instance (DOM du fil, scroll,
 * saisie) survit aux navigations dans l'espace du cours.
 *
 * Le repli masque la carte par **`[hidden]`, jamais `@if`** (invariant du
 * panneau assistant : préserver la conversation affichée) ; l'état
 * plié/déplié vit dans `CourseAssistantService.panelOpen` — dans le service
 * (jamais dans l'URL) pour survivre aussi à un démontage : sortir de
 * l'espace du cours puis y revenir retrouve le panneau tel quel, et la
 * déconnexion le replie. Sous 900px la carte devient une bottom-sheet
 * pleine largeur (voir scss).
 */
@Component({
  selector: 'app-assistant-panel',
  imports: [TranslocoPipe, CourseChat],
  templateUrl: './assistant-panel.html',
  styleUrl: './assistant-panel.scss',
})
export class AssistantPanel {
  readonly courseId = input.required<string>();

  protected readonly assistant = inject(CourseAssistantService);
}
