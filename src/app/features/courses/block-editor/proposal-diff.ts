import { Component, computed, inject, input, OnDestroy, signal } from '@angular/core';
import type { editor, IDisposable } from 'monaco-editor';
import {
  DiffEditorComponent,
  DiffEditorModel,
  NGX_MONACO_EDITOR_CONFIG,
} from 'ngx-monaco-editor-v2';
import { ThemeService } from '../../../core/theme/theme.service';
import { MONACO_CONFIG } from '../../../shared/markdown-editor/monaco-config';

/**
 * Options du diff figées en constante (référence stable — le wrapper recrée
 * l'éditeur à chaque changement de référence de `[options]`) ; le thème
 * initial est injecté par le computed, ses changements ultérieurs passent par
 * `monaco.editor.setTheme` global (effect du `markdown-editor` voisin, monté
 * — masqué — sur la même page). `alwaysConsumeMouseWheel: false` : un diff
 * qui n'a rien à défiler laisse la molette au conteneur défilant de la revue.
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
  scrollbar: { alwaysConsumeMouseWheel: false },
};

/**
 * Le wrapper ngx-monaco dimensionne son conteneur à 98 % de la hauteur de
 * l'élément hôte : la hauteur mesurée du contenu est rapportée à l'hôte, plus
 * les bordures du cadre.
 */
const WRAPPER_CONTAINER_RATIO = 0.98;
const FRAME_BORDERS_PX = 2;

export type ProposalDiffSize = 'fill' | 'auto';

/**
 * Diff Monaco côte à côte de deux textes (`ngx-monaco-diff-editor`, inerte en
 * jsdom) — brique des revues de proposition HITL : contenu courant |
 * proposition. `language` : `oc-markdown` (défaut — markdown de cours) ou
 * `plaintext` (corrigé d'une question).
 *
 * Deux régimes de hauteur (`size`) : **`fill`** (défaut) — le diff remplit la
 * hauteur laissée par son hôte flex en colonne (revue d'un bloc texte : un
 * seul diff, toute la colonne) ; **`auto`** — la hauteur suit le CONTENU
 * (plus haut des deux volets, mesuré à l'init de Monaco puis à chaque
 * changement de taille de contenu — le retour à la ligne dépend de la
 * largeur), bornée par `minHeight`/`maxHeight` (revue structurée d'un
 * exercice : plusieurs petits diffs empilés dans un corps défilant, au-delà de
 * la borne le diff défile en interne). Sans Monaco (jsdom, SSR, chargement),
 * la hauteur de repli vient du CSS.
 */
@Component({
  selector: 'app-proposal-diff',
  imports: [DiffEditorComponent],
  templateUrl: './proposal-diff.html',
  styleUrl: './proposal-diff.scss',
  providers: [{ provide: NGX_MONACO_EDITOR_CONFIG, useValue: MONACO_CONFIG }],
  host: { '[class.proposal-diff--fill]': "size() === 'fill'" },
})
export class ProposalDiff implements OnDestroy {
  readonly #theme = inject(ThemeService);

  readonly original = input.required<string>();
  readonly modified = input.required<string>();
  readonly language = input<'oc-markdown' | 'plaintext'>('oc-markdown');
  readonly size = input<ProposalDiffSize>('fill');
  /** Bornes (px) de la hauteur en régime `auto`. */
  readonly minHeight = input(96);
  readonly maxHeight = input(360);

  /** Hauteur mesurée du contenu (régime `auto`) ; `null` = repli CSS. */
  protected readonly measuredHeight = signal<number | null>(null);
  #subscriptions: IDisposable[] = [];

  protected readonly originalModel = computed<DiffEditorModel>(() => ({
    code: this.original(),
    language: this.language(),
  }));
  protected readonly modifiedModel = computed<DiffEditorModel>(() => ({
    code: this.modified(),
    language: this.language(),
  }));

  readonly #initialTheme = this.#theme.theme();
  protected readonly diffOptions = computed<editor.IStandaloneDiffEditorConstructionOptions>(
    () => ({
      ...DIFF_OPTIONS,
      theme: this.#initialTheme === 'dark' ? 'oc-vs-dark' : 'oc-vs',
    }),
  );

  /** Instance émise par le wrapper : en régime `auto`, la hauteur suit le contenu. */
  protected onEditorInit(diff: editor.IStandaloneDiffEditor): void {
    this.#dispose();
    if (this.size() !== 'auto') {
      return;
    }
    const panes = [diff.getOriginalEditor(), diff.getModifiedEditor()];
    const measure = (): void => {
      const content = Math.max(...panes.map((pane) => pane.getContentHeight()));
      const wanted = Math.ceil(content / WRAPPER_CONTAINER_RATIO) + FRAME_BORDERS_PX;
      this.measuredHeight.set(Math.min(this.maxHeight(), Math.max(this.minHeight(), wanted)));
    };
    this.#subscriptions = panes.map((pane) => pane.onDidContentSizeChange(measure));
    measure();
  }

  ngOnDestroy(): void {
    this.#dispose();
  }

  #dispose(): void {
    for (const subscription of this.#subscriptions) {
      subscription.dispose();
    }
    this.#subscriptions = [];
  }
}
