import { effect, Injectable, signal } from '@angular/core';
import { AssistantChatState } from './assistant-chat-state';

export type { AssistantStreamState, AssistantToolActivity } from './assistant-chat-state';

/**
 * Assistant IA du contexte GLOBAL d'un cours — l'instance root d'
 * `AssistantChatState` (portée `course`, défaut), consommée par le panneau
 * flottant `assistant-panel` monté une fois dans le shell. Les chats ancrés
 * des éditeurs (contextes d'édition) fournissent leur PROPRE instance
 * d'`AssistantChatState` au niveau du composant hôte : ce service n'ajoute que
 * l'état propre au panneau flottant.
 */
@Injectable({ providedIn: 'root' })
export class CourseAssistantService extends AssistantChatState {
  /**
   * État déplié/replié du panneau assistant flottant : l'assistant ouvert
   * reste ouvert quand l'utilisateur navigue — notamment en suivant une
   * citation `oc-block:` vers l'éditeur du bloc cité. Volontairement hors du
   * reset de la classe de base : changer de cours ne referme pas le panneau ;
   * seul un signal de déconnexion le replie.
   */
  readonly #panelOpen = signal(false);
  readonly panelOpen = this.#panelOpen.asReadonly();

  constructor() {
    super();
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.#panelOpen.set(false);
      }
    });
  }

  setPanelOpen(open: boolean): void {
    this.#panelOpen.set(open);
  }
}
