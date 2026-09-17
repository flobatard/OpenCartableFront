import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssistantDelegation } from '../../../core/course-assistant/delegation';
import { MarkdownView } from '../../../shared/markdown-view/markdown-view';
import { CourseChatProposal } from './course-chat-proposal';
import { CourseChatQuestionsCard, QuestionsCardStatus } from './course-chat-questions-card';
import { ChatToolView, CourseChatTool } from './course-chat-tool';

/**
 * Un appel du sous-assistant, tel que la carte le rend : ligne d'outil
 * générique, carte de proposition (revue dans la fenêtre globale) ou carte de
 * questions — préparé par l'hôte (`CourseChat`), qui seul connaît l'état
 * des questions en attente.
 */
export type DelegationChildView =
  | { kind: 'tool'; tool: ChatToolView }
  | { kind: 'proposal'; tool: ChatToolView; summary: string | null }
  | {
      kind: 'questions';
      tool: ChatToolView;
      count: number;
      status: QuestionsCardStatus;
      result: string | null;
    };

/**
 * Carte d'une délégation dans le FIL du chat global (édition globale,
 * `core/course-assistant/delegation.ts`) : l'assistant a confié une cible à
 * un sous-assistant d'édition. En-tête (cible), consignes repliées, puis —
 * en direct seulement, rien de tout cela n'est persisté — l'activité du
 * sous-assistant (lectures, propositions revues dans la fenêtre globale,
 * questions) et son texte ; enfin l'invite « travaille » tant que l'appel
 * tourne, ou le compte rendu (résultat du tool `edit_*`), y compris pour une
 * conversation rechargée.
 */
@Component({
  selector: 'app-course-chat-delegation',
  imports: [
    TranslocoPipe,
    MarkdownView,
    CourseChatProposal,
    CourseChatQuestionsCard,
    CourseChatTool,
  ],
  templateUrl: './course-chat-delegation.html',
  styleUrl: './course-chat-delegation.scss',
})
export class CourseChatDelegation {
  readonly delegation = input.required<AssistantDelegation>();
  /** État de l'appel `edit_*` : `running` tant que le sous-assistant travaille. */
  readonly status = input.required<'running' | 'done' | 'error'>();
  /** Compte rendu du sous-assistant (extrait du tour `tool`) ; `null` tant qu'il tourne. */
  readonly result = input<string | null>(null);
  /** Activité du sous-assistant en direct (vide pour une conversation rechargée). */
  readonly children = input<DelegationChildView[]>([]);
  /** Texte streamé par le sous-assistant (direct seulement). */
  readonly agentText = input('');

  /** Le professeur veut rouvrir la revue de la proposition en attente. */
  readonly review = output<void>();
}
