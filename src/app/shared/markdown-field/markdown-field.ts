import {
  Component,
  computed,
  effect,
  ElementRef,
  forwardRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  hasCourseDiagrams,
  renderCourseDiagrams,
  renderCourseMarkdown,
} from '../../core/markdown/course-markdown';
import { ThemeService } from '../../core/theme/theme.service';
import { MarkdownEditor } from '../markdown-editor/markdown-editor';
import { MarkdownHelpDialog } from '../markdown-help-dialog/markdown-help-dialog';

/** Suffixe d'ids uniques par instance (le tablist ARIA doit être unique — un
    écran peut monter plusieurs champs). Compteur de module, jamais Date/Random. */
let sequence = 0;

type FieldTab = 'editor' | 'preview';

/**
 * Champ markdown réutilisable (`ControlValueAccessor`, valeur = string) :
 * onglets Éditeur | Aperçu, éditeur Monaco (`app-markdown-editor`), aperçu
 * rendu localement (markdown + KaTeX puis Mermaid) et modale d'aide à la mise
 * en forme. C'est l'unité que composeront les futurs éditeurs (bloc texte,
 * exercice…). Composition d'un `FormControl` interne — patron `SubjectMultiPicker`.
 *
 * Navigateur uniquement : l'aperçu (DOMPurify/Mermaid) et Monaco touchent
 * `window` — toute page hôte doit être en `RenderMode.Client`.
 */
@Component({
  selector: 'app-markdown-field',
  imports: [ReactiveFormsModule, TranslocoPipe, MarkdownEditor, MarkdownHelpDialog],
  templateUrl: './markdown-field.html',
  styleUrl: './markdown-field.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MarkdownField), multi: true },
  ],
})
export class MarkdownField implements ControlValueAccessor {
  readonly #sanitizer = inject(DomSanitizer);
  readonly #theme = inject(ThemeService);
  readonly #transloco = inject(TranslocoService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

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

  /** Valeur locale en cours de frappe — alimente l'aperçu (pas une version sauvegardée). */
  readonly #draft = signal('');
  protected readonly hasDraft = computed(() => this.#draft().trim().length > 0);

  /**
   * HTML de l'aperçu (markdown + KaTeX, puis diagrammes Mermaid). La
   * sanitisation vit dans course-markdown (DOMPurify) ; le bypass évite
   * uniquement le second nettoyage d'Angular, qui dépouillerait les attributs
   * style et le MathML/SVG dont dépendent KaTeX et Mermaid. Signal (et non
   * computed) car la passe Mermaid est asynchrone — cf. l'effect ci-dessous.
   */
  readonly #previewHtml = signal<SafeHtml>(this.#sanitizer.bypassSecurityTrustHtml(''));
  protected readonly previewHtml = this.#previewHtml.asReadonly();

  #onChange: (value: string) => void = () => {};
  #onTouched: () => void = () => {};

  constructor() {
    this.control.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.#draft.set(value);
      this.#onTouched();
      this.#onChange(value);
    });

    // Aperçu : rendu markdown+KaTeX synchrone (chemin rapide), puis passe
    // Mermaid asynchrone. Gardé sur l'onglet aperçu (paresse) et sur le
    // navigateur (DOMPurify/Mermaid). Re-rendu quand le thème change.
    effect((onCleanup) => {
      if (!this.#isBrowser || this.activeTab() !== 'preview') {
        return;
      }
      const theme = this.#theme.theme();
      const base = renderCourseMarkdown(this.#draft());
      this.#previewHtml.set(this.#sanitizer.bypassSecurityTrustHtml(base));
      if (!hasCourseDiagrams(base)) {
        return;
      }
      // Frappe/thème pendant le rendu async : la passe périmée est ignorée.
      let stale = false;
      onCleanup(() => (stale = true));
      const mathNote = this.#transloco.translate('markdownField.mermaidMathNote');
      const errorLabel = this.#transloco.translate('markdownField.mermaidError');
      void renderCourseDiagrams(base, theme, mathNote, errorLabel).then((enhanced) => {
        if (!stale) {
          this.#previewHtml.set(this.#sanitizer.bypassSecurityTrustHtml(enhanced));
        }
      });
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
