import { Component, computed, forwardRef, inject, signal } from '@angular/core';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { SubjectService } from '../../core/subjects/subject.service';
import { SubjectNode } from '../../core/subjects/subject.model';
import { findById } from '../../core/subjects/subject.utils';
import { SubjectPicker } from '../subject-picker/subject-picker';

/**
 * Sélecteur de PLUSIEURS matières, utilisable en Reactive Forms
 * (`ControlValueAccessor`, valeur = tableau d'`id`, ordre d'ajout, jamais
 * `null`, ids dédoublonnés ; un id inconnu de l'arbre n'a pas de chip mais
 * reste préservé — même contrat que `EducationLevelPicker`).
 *
 * Composition plutôt qu'extension : le `SubjectPicker` mono-sélection
 * (treeview ARIA + recherche) sert de champ d'ajout via un `FormControl`
 * interne — chaque sélection est ajoutée puis le champ est réinitialisé.
 * Les sélections s'affichent en chips (badge « matière », indigo) sous le champ.
 */
@Component({
  selector: 'app-subject-multi-picker',
  imports: [ReactiveFormsModule, SubjectPicker, TranslocoPipe],
  templateUrl: './subject-multi-picker.html',
  styleUrl: './subject-multi-picker.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SubjectMultiPicker),
      multi: true,
    },
  ],
})
export class SubjectMultiPicker implements ControlValueAccessor {
  readonly #subjects = inject(SubjectService);

  /** Champ d'ajout : le picker mono interne, réinitialisé après chaque sélection. */
  protected readonly picker = new FormControl<string | null>(null);

  protected readonly value = signal<string[]>([]);
  protected readonly disabled = signal(false);

  /** Nœuds sélectionnés résolus dans l'arbre, en ordre d'ajout (chips). */
  protected readonly chips = computed(() =>
    this.value()
      .map((id) => findById(this.#subjects.tree(), id))
      .filter((node): node is SubjectNode => node !== undefined),
  );

  #onChange: (value: string[]) => void = () => {};
  #onTouched: () => void = () => {};

  constructor() {
    this.picker.valueChanges.subscribe((id) => {
      if (!id) {
        return;
      }
      // Champ d'ajout : on vide le picker sans réémettre (pas de boucle).
      this.picker.setValue(null, { emitEvent: false });
      this.#onTouched();
      if (this.value().includes(id)) {
        return;
      }
      const next = [...this.value(), id];
      this.value.set(next);
      this.#onChange([...next]);
    });
  }

  // --- ControlValueAccessor ---------------------------------------------------

  writeValue(ids: string[] | null): void {
    // Copie défensive + dédoublonnage ; ne notifie jamais onChange (contrat CVA).
    this.value.set([...new Set(ids ?? [])]);
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.#onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.#onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
    isDisabled ? this.picker.disable({ emitEvent: false }) : this.picker.enable({ emitEvent: false });
  }

  // --- Sélection ----------------------------------------------------------------

  protected remove(id: string): void {
    if (this.disabled()) {
      return;
    }
    const next = this.value().filter((v) => v !== id);
    this.value.set(next);
    this.#onTouched();
    this.#onChange([...next]);
  }
}
