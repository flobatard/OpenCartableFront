import { Component, effect, forwardRef, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { editor } from 'monaco-editor';
import {
  EditorComponent,
  NGX_MONACO_EDITOR_CONFIG,
  NgxMonacoEditorConfig,
} from 'ngx-monaco-editor-v2';
import { ThemeService } from '../../core/theme/theme.service';
import { Spinner } from '../spinner/spinner';
import { CourseMonacoApi, registerCourseMonacoLanguages } from './course-monaco-lang';

/**
 * Monaco est servi en AMD depuis les assets copiés (angular.json) — jamais bundlé.
 * `onMonacoLoad` tire UNE fois, après le chargement de monaco et AVANT le premier
 * `editor.create` : c'est le point d'ancrage pour enregistrer nos langages
 * (`oc-markdown`/`latex`/`mermaid`) et thèmes (`oc-vs`/`oc-vs-dark`) une seule
 * fois, globalement. Il ne reçoit aucun argument → on lit `window.monaco`.
 */
const MONACO_CONFIG: NgxMonacoEditorConfig = {
  baseUrl: '/monaco/vs',
  onMonacoLoad: () => {
    const m = (globalThis as { monaco?: CourseMonacoApi }).monaco;
    if (m) {
      registerCourseMonacoLanguages(m);
    }
  },
};

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

  /** Relais interne vers le CVA de ngx-monaco-editor. */
  protected readonly inner = new FormControl('', { nonNullable: true });

  /** Référence stable (cf. EDITOR_OPTIONS) ; thème initial snapshotté.
   *  Thèmes custom oc-vs/oc-vs-dark (accent indigo sur le math) — cf. course-monaco-lang.ts. */
  protected readonly editorOptions: editor.IStandaloneEditorConstructionOptions = {
    ...EDITOR_OPTIONS,
    theme: this.#theme.theme() === 'dark' ? 'oc-vs-dark' : 'oc-vs',
  };

  readonly #ready = signal(false);
  /** Vrai une fois monaco initialisé ; pilote l'overlay de chargement. */
  protected readonly ready = this.#ready.asReadonly();
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

  protected onEditorInit(): void {
    this.#ready.set(true);
    // La webfont JetBrains Mono arrive souvent après monaco : re-mesurer,
    // sinon curseur et sélection sont décalés.
    document.fonts?.ready.then(() => monacoGlobal()?.editor.remeasureFonts());
  }

  // --- ControlValueAccessor ---------------------------------------------------

  writeValue(value: string | null): void {
    this.#value = value ?? '';
    this.inner.setValue(this.#value, { emitEvent: false });
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
