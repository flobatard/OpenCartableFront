import { Component, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Pied de page d'une revue de proposition HITL, partagé par les revues texte
 * (`app-proposal-review`) et exercice (`app-exercise-proposal-review`) : champ
 * commentaire (≤ 2 000 caractères, relayé au modèle dans le résultat du
 * tool), message d'erreur (`errorKey`, i18n) et décision — « Accepter et
 * appliquer » / « Rejeter » — émise avec le commentaire trimé. Présentational :
 * `busy` neutralise les boutons, `acceptDisabled` la seule acceptation (cible
 * de la proposition disparue : seul le rejet reste possible).
 */
@Component({
  selector: 'app-proposal-decision',
  imports: [TranslocoPipe],
  templateUrl: './proposal-decision.html',
  styleUrl: './proposal-decision.scss',
})
export class ProposalDecision {
  /** Envoi de la décision en cours : boutons neutralisés. */
  readonly busy = input(false);
  /** Clé i18n de l'erreur affichée (`null` = aucune). */
  readonly errorKey = input<string | null>(null);
  /** Acceptation impossible (rejet seul) — ex. question visée introuvable. */
  readonly acceptDisabled = input(false);

  /** Décision du professeur — la valeur émise est son commentaire (peut être vide). */
  readonly accepted = output<string>();
  readonly rejected = output<string>();

  protected readonly comment = signal('');

  protected onCommentInput(event: Event): void {
    this.comment.set((event.target as HTMLTextAreaElement).value);
  }

  protected accept(): void {
    this.accepted.emit(this.comment().trim());
  }

  protected reject(): void {
    this.rejected.emit(this.comment().trim());
  }
}
