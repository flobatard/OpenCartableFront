import { Injectable } from '@angular/core';
import { AssistantPendingProposal } from './proposals';

/**
 * Ce qu'un éditeur monté sait faire d'une proposition visant sa cible :
 * l'appliquer (Monaco, formulaire — `false` = cible introuvable dans
 * l'éditeur) puis flusher son autosave (le back relit la cible EN BASE à la
 * reprise).
 */
export interface TargetApplier {
  apply(proposal: AssistantPendingProposal): boolean;
  flush(): Promise<void>;
}

/**
 * Éditeurs montés, par id de cible (bloc ou module) — pour l'hôte global des
 * propositions de sous-assistants (`CourseAssistantService`) : quand le
 * professeur a l'éditeur de la cible sous les yeux, une proposition acceptée
 * s'applique DANS cet éditeur (édit annulable par Ctrl-Z, autosave) plutôt
 * que par un PATCH headless que sa prochaine frappe écraserait (l'éditeur
 * ne se ré-initialise jamais depuis le détail du cours). `BlockEditor` et
 * `ModuleEditor` s'inscrivent à leur construction et se retirent à leur
 * destruction (`DestroyRef`).
 */
@Injectable({ providedIn: 'root' })
export class TargetApplierRegistry {
  readonly #appliers = new Map<string, TargetApplier>();

  /** Inscrit l'appliqueur de la cible ; rend la fonction de retrait. */
  register(targetId: string, applier: TargetApplier): () => void {
    this.#appliers.set(targetId, applier);
    return () => {
      if (this.#appliers.get(targetId) === applier) {
        this.#appliers.delete(targetId);
      }
    };
  }

  /** L'appliqueur de l'éditeur monté sur cette cible, `null` sinon. */
  get(targetId: string): TargetApplier | null {
    return this.#appliers.get(targetId) ?? null;
  }
}
