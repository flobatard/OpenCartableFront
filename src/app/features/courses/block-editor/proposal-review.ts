import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { editor } from 'monaco-editor';
import {
  DiffEditorComponent,
  DiffEditorModel,
  NGX_MONACO_EDITOR_CONFIG,
} from 'ngx-monaco-editor-v2';
import { ThemeService } from '../../../core/theme/theme.service';
import { MONACO_CONFIG } from '../../../shared/markdown-editor/monaco-config';

/**
 * Une proposition de réécriture EN ATTENTE de décision, dérivée par l'hôte de
 * l'activité d'outils du chat (`propose_block_edit` en cours — le flux SSE est
 * bloqué sur la gate HITL du back tant que le professeur n'a pas tranché).
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
 * Options du diff figées en constante (référence stable — le wrapper recrée
 * l'éditeur à chaque changement de référence de `[options]`) ; le thème
 * initial est injecté par le computed, ses changements ultérieurs passent par
 * `monaco.editor.setTheme` global (effect du `markdown-editor` voisin, monté
 * — masqué par `[hidden]` — sur la même page).
 */
const DIFF_OPTIONS: editor.IStandaloneDiffEditorConstructionOptions = {
  readOnly: true,
  originalEditable: false,
  renderSideBySide: true,
  wordWrap: 'on',
  minimap: { enabled: false },
  lineNumbers: 'off',
  folding: false,
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 14,
  automaticLayout: true,
  scrollBeyondLastLine: false,
  unicodeHighlight: { ambiguousCharacters: false },
};

/**
 * Revue d'une proposition de réécriture (flux HITL du contexte `block_text`) :
 * montée par `BlockEditor` À LA PLACE du champ markdown (masqué par `[hidden]`
 * — Monaco survit) dès qu'une proposition attend — **diff Monaco côte à côte**
 * (contenu courant | proposition, `ngx-monaco-diff-editor`, inerte en jsdom),
 * résumé du modèle, champ commentaire (relayé au modèle dans le résultat du
 * tool) et décision : « Accepter et appliquer » (l'hôte écrit le markdown dans
 * son éditeur puis envoie la décision) ou « Rejeter ». Présentational — la
 * décision part par les outputs, `busy`/`error` viennent de l'hôte.
 */
@Component({
  selector: 'app-proposal-review',
  imports: [TranslocoPipe, DiffEditorComponent],
  templateUrl: './proposal-review.html',
  styleUrl: './proposal-review.scss',
  providers: [{ provide: NGX_MONACO_EDITOR_CONFIG, useValue: MONACO_CONFIG }],
})
export class ProposalReview {
  readonly #theme = inject(ThemeService);

  readonly proposal = input.required<PendingProposal>();
  /** Contenu courant de l'éditeur hôte (« original » du diff). */
  readonly original = input.required<string>();
  /** Envoi de la décision en cours : boutons neutralisés. */
  readonly busy = input(false);
  /** Échec de l'envoi de la décision (réessayable). */
  readonly error = input(false);

  /** Décision du professeur — la valeur émise est son commentaire (peut être vide). */
  readonly accepted = output<string>();
  readonly rejected = output<string>();

  protected readonly comment = signal('');

  protected readonly originalModel = computed<DiffEditorModel>(() => ({
    code: this.original(),
    language: 'oc-markdown',
  }));
  protected readonly modifiedModel = computed<DiffEditorModel>(() => ({
    code: this.proposal().markdown,
    language: 'oc-markdown',
  }));

  readonly #initialTheme = this.#theme.theme();
  protected readonly diffOptions = computed<editor.IStandaloneDiffEditorConstructionOptions>(
    () => ({
      ...DIFF_OPTIONS,
      theme: this.#initialTheme === 'dark' ? 'oc-vs-dark' : 'oc-vs',
    }),
  );

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
