import {
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownEditor } from '../markdown-editor/markdown-editor';
import { MarkdownHelpDialog } from '../markdown-help-dialog/markdown-help-dialog';
import { MarkdownView } from '../markdown-view/markdown-view';

/** Suffixe d'ids uniques par instance (le tablist ARIA doit être unique — un
    écran peut monter plusieurs champs). Compteur de module, jamais Date/Random. */
let sequence = 0;

type FieldTab = 'editor' | 'preview';

/**
 * Champ markdown réutilisable (`ControlValueAccessor`, valeur = string) :
 * onglets Éditeur | Aperçu, éditeur Monaco (`app-markdown-editor`), aperçu
 * rendu par `app-markdown-view` (markdown + KaTeX puis Mermaid) et modale
 * d'aide à la mise en forme. C'est l'unité que composeront les futurs éditeurs
 * (bloc texte, exercice…). Composition d'un `FormControl` interne — patron
 * `SubjectMultiPicker`.
 *
 * Navigateur uniquement : l'aperçu (DOMPurify/Mermaid) et Monaco touchent
 * `window` — toute page hôte doit être en `RenderMode.Client`.
 */
@Component({
  selector: 'app-markdown-field',
  imports: [ReactiveFormsModule, TranslocoPipe, MarkdownEditor, MarkdownHelpDialog, MarkdownView],
  templateUrl: './markdown-field.html',
  styleUrl: './markdown-field.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MarkdownField), multi: true },
  ],
})
export class MarkdownField implements ControlValueAccessor {
  /** Préfixe d'ids ARIA propre à l'instance. */
  protected readonly uid = `md-field-${sequence++}`;

  /**
   * Contenu markdown. Public — exception à la convention `protected` : jsdom ne
   * peut pas taper dans Monaco, les specs pilotent ce contrôle (comme l'ex-
   * `content` de block-editor).
   */
  readonly control = new FormControl('', { nonNullable: true });

  protected readonly activeTab = signal<FieldTab>('editor');
  protected readonly disabled = signal(false);

  protected readonly editorTabRef = viewChild<ElementRef<HTMLButtonElement>>('editorTab');
  protected readonly previewTabRef = viewChild<ElementRef<HTMLButtonElement>>('previewTab');
  protected readonly help = viewChild(MarkdownHelpDialog);

  /** Valeur locale en cours de frappe — alimente l'aperçu (pas une version
      sauvegardée). Public : le template la passe à `app-markdown-view`. */
  readonly #draft = signal('');
  protected readonly draft = this.#draft.asReadonly();
  protected readonly hasDraft = computed(() => this.#draft().trim().length > 0);

  #onChange: (value: string) => void = () => {};
  #onTouched: () => void = () => {};

  constructor() {
    this.control.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.#draft.set(value);
      this.#onTouched();
      this.#onChange(value);
    });
  }

  // --- ControlValueAccessor ---------------------------------------------------

  writeValue(value: string | null): void {
    const next = value ?? '';
    this.#draft.set(next);
    this.control.setValue(next, { emitEvent: false });
  }

  registerOnChange(fn: (value: string) => void): void {
    this.#onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.#onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
    if (isDisabled) {
      this.control.disable({ emitEvent: false });
    } else {
      this.control.enable({ emitEvent: false });
    }
  }

  // --- Onglets & aide ----------------------------------------------------------

  protected selectTab(tab: FieldTab): void {
    this.activeTab.set(tab);
  }

  /** Flèches gauche/droite : bascule d'onglet + déplacement du focus (APG tabs). */
  protected onTablistKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const next: FieldTab = this.activeTab() === 'editor' ? 'preview' : 'editor';
    this.activeTab.set(next);
    const ref = next === 'editor' ? this.editorTabRef() : this.previewTabRef();
    ref?.nativeElement.focus();
  }

  protected openHelp(): void {
    this.help()?.open();
  }
}
