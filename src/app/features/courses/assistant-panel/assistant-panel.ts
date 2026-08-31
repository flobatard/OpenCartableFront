import { Component, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CourseChat } from '../course-chat/course-chat';

/**
 * Hôte flottant de l'assistant du cours (contexte global) — épinglé au
 * viewport en bas à droite (`position: fixed` : il survit au scroll de la
 * page cours), repliable en pilule « Assistant ».
 *
 * Le repli masque la carte par **`[hidden]`, jamais `@if`** (invariant du
 * panneau assistant : préserver la conversation affichée) ; l'état
 * plié/déplié est un signal local, pas dans l'URL. Sous 900px la carte
 * devient une bottom-sheet pleine largeur (voir scss).
 */
@Component({
  selector: 'app-assistant-panel',
  imports: [TranslocoPipe, CourseChat],
  templateUrl: './assistant-panel.html',
  styleUrl: './assistant-panel.scss',
})
export class AssistantPanel {
  readonly courseId = input.required<string>();

  protected readonly expanded = signal(false);
}
