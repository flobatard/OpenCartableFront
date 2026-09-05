import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  AssistantModuleProposal,
  PROPOSAL_TOOL_BY_KIND,
} from '../../../core/course-assistant/proposals';
import { ProposalDecision } from './proposal-decision';
import { ProposalDiff, ProposalDiffLanguage } from './proposal-diff';

/** Langage Monaco du diff, par fichier visé. */
const DIFF_LANGUAGE: Readonly<Record<AssistantModuleProposal['kind'], ProposalDiffLanguage>> = {
  module_html: 'html',
  module_css: 'css',
  module_js: 'javascript',
};

/**
 * Revue d'une proposition de code d'un module (flux HITL du contexte
 * `module`, UN fichier par proposition) : montée par
 * `ModuleEditor` À LA PLACE du pane éditeur (masqué par classe — les trois
 * Monaco survivent), le pane **aperçu restant visible et exécutant déjà le
 * code proposé**. En-tête (titre + fichier visé + résumé du modèle), diff
 * Monaco côte à côte (code courant | proposé, colorisé selon le fichier), puis
 * le pied de page partagé `app-proposal-decision`. Présentational — la
 * décision part par les outputs, `busy`/`errorKey` viennent de l'hôte.
 */
@Component({
  selector: 'app-module-proposal-review',
  imports: [TranslocoPipe, ProposalDiff, ProposalDecision],
  templateUrl: './module-proposal-review.html',
  styleUrl: './module-proposal-review.scss',
})
export class ModuleProposalReview {
  readonly proposal = input.required<AssistantModuleProposal>();
  /** Code courant du fichier visé (« original » du diff, figé à l'interrupt). */
  readonly original = input.required<string>();
  /** Envoi de la décision en cours : boutons neutralisés. */
  readonly busy = input(false);
  /** Clé i18n de l'erreur affichée (échec de l'envoi, réessayable) ; `null` sinon. */
  readonly errorKey = input<string | null>(null);

  /** Décision du professeur — la valeur émise est son commentaire (peut être vide). */
  readonly accepted = output<string>();
  readonly rejected = output<string>();

  protected readonly language = computed<ProposalDiffLanguage>(
    () => DIFF_LANGUAGE[this.proposal().kind],
  );

  /** Clé i18n du libellé du fichier visé (`courseChat.proposal.module.*`). */
  protected readonly fileKey = computed(
    () => `courseChat.proposal.titles.${PROPOSAL_TOOL_BY_KIND[this.proposal().kind]}`,
  );
}
