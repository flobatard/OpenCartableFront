import {
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { EducationLevelService } from '../../core/education-levels/education-level.service';
import { EducationLevelNode } from '../../core/education-levels/education-level.model';
import { flattenTree, sortByTreeOrder } from '../../core/education-levels/education-level.utils';

/** Compteur d'instances : ids uniques (ARIA, `for`) quand plusieurs pickers coexistent. */
let pickerUid = 0;

/**
 * Sélecteur de PLUSIEURS niveaux d'étude, utilisable en Reactive Forms
 * (`ControlValueAccessor`, valeur = tableau d'`id` de nœuds, toujours émis en
 * ordre d'arbre). Cycles ET classes sont cochables indépendamment : cocher un
 * cycle signifie « tout le cycle » et ne cascade pas sur ses classes.
 *
 * Pattern disclosure + cases à cocher natives (l'arbre est petit et toujours
 * entièrement déplié : pas de recherche ni de treeview repliable, clavier et
 * annonces lecteur d'écran fournis par les checkboxes elles-mêmes). Les
 * sélections s'affichent en chips (badge « niveau » du design system) SOUS le
 * champ — jamais de bouton imbriqué dans le bouton-champ.
 */
@Component({
  selector: 'app-education-level-picker',
  imports: [TranslocoPipe],
  templateUrl: './education-level-picker.html',
  styleUrl: './education-level-picker.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EducationLevelPicker),
      multi: true,
    },
  ],
})
export class EducationLevelPicker implements ControlValueAccessor {
  readonly #levels = inject(EducationLevelService);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #uid = pickerUid++;

  protected readonly fieldButton = viewChild<ElementRef<HTMLButtonElement>>('fieldBox');

  protected readonly tree = this.#levels.tree;
  protected readonly value = signal<string[]>([]);
  protected readonly disabled = signal(false);
  protected readonly open = signal(false);

  protected readonly panelId = `education-level-picker-${this.#uid}-panel`;

  /** Lignes de l'arbre, toujours entièrement déplié (~22 nœuds). */
  protected readonly rows = computed(() => flattenTree(this.tree()));

  protected readonly valueSet = computed(() => new Set(this.value()));

  /** Nœuds sélectionnés résolus dans l'arbre, en ordre d'arbre (chips). Un id
   *  inconnu de l'arbre n'a pas de chip mais reste préservé dans la valeur. */
  protected readonly chips = computed(() =>
    this.rows()
      .filter((r) => this.valueSet().has(r.node.id))
      .map((r) => r.node),
  );

  #onChange: (value: string[]) => void = () => {};
  #onTouched: () => void = () => {};

  constructor() {
    if (this.#isBrowser) {
      this.#levels.load();
    }
  }

  // --- ControlValueAccessor ---------------------------------------------------

  writeValue(ids: string[] | null): void {
    // Copie défensive ; ne notifie jamais onChange (contrat CVA).
    this.value.set([...(ids ?? [])]);
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.#onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.#onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
    if (isDisabled) {
      this.open.set(false);
    }
  }

  // --- Sélection ----------------------------------------------------------------

  protected toggleValue(node: EducationLevelNode): void {
    if (this.disabled()) {
      return;
    }
    const current = this.value();
    const next = current.includes(node.id)
      ? current.filter((id) => id !== node.id)
      : sortByTreeOrder(this.tree(), [...current, node.id]);
    this.value.set(next);
    // Nouvelle instance à chaque émission : l'état interne reste inaltérable.
    this.#onChange([...next]);
  }

  protected domId(node: EducationLevelNode): string {
    return `education-level-picker-${this.#uid}-${node.id}`;
  }

  // --- Ouverture / fermeture ----------------------------------------------------

  protected toggle(): void {
    if (this.disabled()) {
      return;
    }
    this.open() ? this.#close() : this.open.set(true);
  }

  protected onEscape(): void {
    if (!this.open()) {
      return;
    }
    this.#close();
    this.fieldButton()?.nativeElement.focus();
  }

  #close(): void {
    this.open.set(false);
    this.#onTouched();
  }

  /** Ferme si le focus quitte le composant (clic/tab en dehors). */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.#host.nativeElement.contains(next)) {
      this.#close();
    }
  }
}
