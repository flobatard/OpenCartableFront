import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProposalDecision } from '../../../shared/proposal/proposal-decision';
import { ProposalDiff } from '../../../shared/proposal/proposal-diff';

/**
 * Une proposition de réécriture EN ATTENTE de décision (vue de l'hôte),
 * dérivée de la proposition `block_text` du chat (`propose_block_edit` en
 * cours — le flux SSE est bloqué sur la gate HITL du back tant que le
 * professeur n'a pas tranché).
 */
export interface PendingProposal {
  /** Id de l'appel d'outil (clé de la décision côté back). */
  id: string;
  /** Markdown INTÉGRAL de remplacement proposé. */
  markdown: string;
  /** Résumé du changement fourni par le modèle (`null` s'il l'a omis). */
  summary: string | null;
}

/**
 * Revue d'une proposition de réécriture (flux HITL du contexte `block_text`) :
 * montée par `BlockEditor` À LA PLACE du champ markdown (masqué par classe —
 * Monaco survit) dès qu'une proposition attend — **diff Monaco côte à côte**
 * (contenu courant | proposition, `app-proposal-diff`), résumé du modèle, puis
 * le pied de page partagé `app-proposal-decision` (commentaire, Accepter et
 * appliquer / Rejeter). Présentational — la décision part par les outputs,
 * `busy`/`errorKey` viennent de l'hôte.
 */
@Component({
  selector: 'app-proposal-review',
  imports: [TranslocoPipe, ProposalDiff, ProposalDecision],
  templateUrl: './proposal-review.html',
  styleUrl: './proposal-review.scss',
})
export class ProposalReview {
  readonly proposal = input.required<PendingProposal>();
  /** Contenu courant de l'éditeur hôte (« original » du diff). */
  readonly original = input.required<string>();
  /** Envoi de la décision en cours : boutons neutralisés. */
  readonly busy = input(false);
  /** Clé i18n de l'erreur affichée (échec de l'envoi, réessayable) ; `null` sinon. */
  readonly errorKey = input<string | null>(null);

  /** Décision du professeur — la valeur émise est son commentaire (peut être vide). */
  readonly accepted = output<string>();
  readonly rejected = output<string>();
}
