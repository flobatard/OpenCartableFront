import {
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { editor } from 'monaco-editor';
import { EditorComponent, NGX_MONACO_EDITOR_CONFIG } from 'ngx-monaco-editor-v2';
import { ThemeService } from '../../core/theme/theme.service';
import { Spinner } from '../spinner/spinner';
import { MONACO_CONFIG } from './monaco-config';

/**
 * Options figées en constante : le wrapper dispose et recrée l'éditeur à
 * CHAQUE changement de référence de [options]. Le thème passe donc par
 * monaco.editor.setTheme (global), jamais par cet objet.
 */
const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  // Langage custom : markdown intégré + coloration LaTeX ($…$/$$…$$) et Mermaid
  // (cf. course-monaco-lang.ts, enregistré via MONACO_CONFIG.onMonacoLoad).
  language: 'oc-markdown',
  wordWrap: 'on',
  minimap: { enabled: false },
  lineNumbers: 'off',
  folding: false,
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 14,
  automaticLayout: true,
  scrollBeyondLastLine: false,
  padding: { top: 12, bottom: 12 },
  quickSuggestions: false,
  // Prose française : apostrophes/guillemets typographiques non surlignés.
  unicodeHighlight: { ambiguousCharacters: false },
};

type MonacoGlobal = { editor: { setTheme(theme: string): void; remeasureFonts(): void } };

/** Position Monaco (lignes et colonnes indexées à 1). */
export interface EditorPosition {
  readonly lineNumber: number;
  readonly column: number;
}

/** Texte qui remplace la sélection (`MarkdownEditor.replaceSelection`). */
export interface SelectionReplacement {
  /** Texte inséré, fins de ligne `\n`. */
  readonly text: string;
  /** Plage de `text` (décalages) à sélectionner ensuite ; absente = curseur après le texte. */
  readonly select?: { readonly start: number; readonly end: number };
}

/**
 * Position atteinte à `offset` caractères dans `text` inséré à `start`,
 * calculée en lignes et colonnes : insensible à la fin de ligne du modèle
 * (Monaco convertit le texte inséré à la sienne). `text` en fins de ligne `\n`.
 */
export function positionInText(
  start: EditorPosition,
  text: string,
  offset: number,
): EditorPosition {
  const lines = text.slice(0, offset).split('\n');
  const last = lines[lines.length - 1];
  return lines.length === 1
    ? { lineNumber: start.lineNumber, column: start.column + last.length }
    : { lineNumber: start.lineNumber + lines.length - 1, column: last.length + 1 };
}

function monacoGlobal(): MonacoGlobal | undefined {
  return (globalThis as { monaco?: MonacoGlobal }).monaco;
}

/**
 * Éditeur markdown réutilisable (ControlValueAccessor, valeur = string),
 * enrobant `<ngx-monaco-editor>`. Navigateur uniquement : le wrapper ne
 * guard-e pas le SSR — toute page hôte doit être en RenderMode.Client.
 * Le thème monaco (vs / vs-dark) suit ThemeService.
 */
@Component({
  selector: 'app-markdown-editor',
  imports: [EditorComponent, ReactiveFormsModule, Spinner],
  templateUrl: './markdown-editor.html',
  styleUrl: './markdown-editor.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MarkdownEditor), multi: true },
    { provide: NGX_MONACO_EDITOR_CONFIG, useValue: MONACO_CONFIG },
  ],
})
export class MarkdownEditor implements ControlValueAccessor {
  readonly #theme = inject(ThemeService);

  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Langage monaco de l'instance — `oc-markdown` (défaut) ou un
   * langage BUILT-IN de monaco (`html`/`css`/`javascript`, éditeur de module).
   * STATIQUE par instance : le wrapper détruit et recrée l'éditeur à chaque
   * changement de référence de `[options]` — ne jamais binder un langage
   * variable.
   */
  readonly language = input<string>('oc-markdown');

  /** Relais interne vers le CVA de ngx-monaco-editor. */
  protected readonly inner = new FormControl('', { nonNullable: true });

  /** Thème snapshotté à la construction : ses changements ultérieurs passent
   *  par `monaco.editor.setTheme` (global), jamais par les options. */
  readonly #initialTheme = this.#theme.theme();

  /** Référence stable (cf. EDITOR_OPTIONS) : le computed ne réévalue qu'à
   *  l'arrivée du `language` de l'instance, avant la création de l'éditeur.
   *  Thèmes custom oc-vs/oc-vs-dark (accent indigo sur le math) — cf. course-monaco-lang.ts. */
  protected readonly editorOptions = computed<editor.IStandaloneEditorConstructionOptions>(() => ({
    ...EDITOR_OPTIONS,
    language: this.language(),
    theme: this.#initialTheme === 'dark' ? 'oc-vs-dark' : 'oc-vs',
  }));

  readonly #ready = signal(false);
  /** Vrai une fois monaco initialisé ; pilote l'overlay de chargement. */
  protected readonly ready = this.#ready.asReadonly();
  /** Instance monaco captée à l'init — support des édits (`replaceSelection`, `replaceAll`). */
  #editor: editor.IStandaloneCodeEditor | null = null;
  #value = '';
  #touched = false;
  #onChange: (value: string) => void = () => {};
  #onTouched: () => void = () => {};

  constructor() {
    this.inner.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      // Écho du wrapper : un writeValue post-init ré-émet la même valeur via
      // onDidChangeModelContent — ne pas la propager au contrôle hôte.
      if (value === this.#value) {
        return;
      }
      this.#value = value;
      if (!this.#touched) {
        this.#touched = true;
        this.#onTouched();
      }
      this.#onChange(value);
    });

    effect(() => {
      const theme = this.#theme.theme();
      if (this.#ready()) {
        monacoGlobal()?.editor.setTheme(theme === 'dark' ? 'oc-vs-dark' : 'oc-vs');
      }
    });
  }

  protected onEditorInit(instance: editor.IStandaloneCodeEditor): void {
    this.#editor = instance;
    this.#ready.set(true);
    // La webfont JetBrains Mono arrive souvent après monaco : re-mesurer,
    // sinon curseur et sélection sont décalés.
    document.fonts?.ready.then(() => monacoGlobal()?.editor.remeasureFonts());
  }

  /**
   * Insère `text` à la position du curseur (ou remplace la sélection) et rend le
   * focus à l'éditeur, en une étape d'annulation (cf. `replaceSelection`).
   * Sans instance monaco (SSR/jsdom, non initialisé), l'appel est sans effet.
   */
  insertAtCursor(text: string): void {
    this.replaceSelection(() => ({ text }), 'insert-resource');
  }

  /**
   * Remplace la sélection (ou insère au curseur) par le texte que `build`
   * construit à partir du texte sélectionné (fins de ligne `\n`), puis
   * sélectionne la plage `select` du texte inséré — un texte de remplissage que
   * la frappe remplace — et rend le focus. Bornée par des `pushUndoStop` comme
   * `replaceAll` : UNE étape d'annulation, séparée de la frappe adjacente. La
   * mutation du modèle passe la garde anti-écho ci-dessus et se propage seule
   * au contrôle hôte — pas de `#onChange` manuel. Retourne `false` sans instance
   * Monaco (SSR/jsdom, non initialisé) : `build` n'est alors pas appelé.
   */
  replaceSelection(
    build: (selected: string) => SelectionReplacement,
    source = 'insert-snippet',
  ): boolean {
    const ed = this.#editor;
    const model = ed?.getModel();
    const selection = ed?.getSelection();
    if (!ed || !model || !selection) {
      return false;
    }
    const { text, select } = build(model.getValueInRange(selection).replace(/\r\n?/g, '\n'));
    ed.pushUndoStop();
    ed.executeEdits(source, [{ range: selection, text, forceMoveMarkers: true }]);
    ed.pushUndoStop();
    if (select !== undefined) {
      const start = { lineNumber: selection.startLineNumber, column: selection.startColumn };
      const from = positionInText(start, text, select.start);
      const to = positionInText(start, text, select.end);
      ed.setSelection({
        startLineNumber: from.lineNumber,
        startColumn: from.column,
        endLineNumber: to.lineNumber,
        endColumn: to.column,
      });
    }
    ed.focus();
    return true;
  }

  /**
   * Remplace TOUT le contenu par `text` via `executeEdits` : contrairement à
   * un `writeValue` (dont le `setValue` de modèle VIDE la pile d'annulation),
   * l'édit devient une étape d'undo Monaco normale — **Ctrl-Z la retire**,
   * Ctrl-Y/Maj-Ctrl-Z la remet (flux HITL : appliquer une proposition comme
   * n'importe quelle frappe). Bornée par des `pushUndoStop` pour former UNE
   * étape, séparée de la frappe adjacente ; la propagation au contrôle hôte
   * suit le même chemin que `replaceSelection` (garde anti-écho comprise).
   * Retourne `false` sans instance Monaco (SSR/jsdom, non initialisé) —
   * l'appelant se replie sur une écriture de contrôle classique.
   */
  replaceAll(text: string): boolean {
    const ed = this.#editor;
    const model = ed?.getModel();
    if (!ed || !model) {
      return false;
    }
    ed.pushUndoStop();
    ed.executeEdits('apply-proposal', [
      { range: model.getFullModelRange(), text, forceMoveMarkers: true },
    ]);
    ed.pushUndoStop();
    ed.focus();
    return true;
  }

  /** Rend le focus à l'éditeur (no-op sans instance — SSR/jsdom, ou éditeur
      masqué : le focus d'un élément `display:none` échoue en silence). */
  focusEditor(): void {
    this.#editor?.focus();
  }

  // --- ControlValueAccessor ---------------------------------------------------

  writeValue(value: string | null): void {
    const next = value ?? '';
    if (next === this.#value) {
      // Écho d'une valeur déjà en place : ne JAMAIS redescendre au wrapper —
      // son writeValue fait un `editor.setValue` ASYNCHRONE (setTimeout) qui
      // viderait la pile d'annulation, même à valeur identique (vérifié en
      // vrai navigateur) — les édits Monaco (replaceAll, replaceSelection)
      // resteraient inannulables.
      return;
    }
    this.#value = next;
    this.inner.setValue(next, { emitEvent: false });
  }

  registerOnChange(fn: (value: string) => void): void {
    this.#onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.#onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    // Le wrapper applique readOnly à chaud via son propre setDisabledState.
    if (isDisabled) {
      this.inner.disable({ emitEvent: false });
    } else {
      this.inner.enable({ emitEvent: false });
    }
  }
}
