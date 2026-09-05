import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  buildBlockMetaForm,
  patchBlockMetaForm,
  payloadFromBlockMetaForm,
} from '../../../core/courses/block-meta-form';
import { BlockMetaPayload, CourseBlock } from '../../../core/courses/course.model';
import { CourseService } from '../../../core/courses/course.service';

type MetaSaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Titre/description d'un bloc (tous types) — formulaire à enregistrement
 * EXPLICITE (bouton), indépendant de l'autosave du contenu : initialisé une
 * seule fois depuis le bloc, bouton actif seulement si le payload diffère du
 * dernier enregistré (snapshot JSON), `updateBlockMeta` n'envoie que le méta
 * (jamais le `content`). Pas de flush à la destruction (save explicite).
 */
@Component({
  selector: 'app-block-meta-editor',
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './block-meta-editor.html',
  styleUrl: './block-meta-editor.scss',
})
export class BlockMetaEditor implements OnInit {
  readonly #courses = inject(CourseService);

  readonly courseId = input.required<string>();
  readonly blockId = input.required<string>();
  /** Bloc édité — lu UNE fois à l'init (le patch du détail après un save ne réécrit pas la frappe). */
  readonly block = input.required<CourseBlock>();

  protected readonly form = buildBlockMetaForm();
  readonly #value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly #savedPayload = signal<BlockMetaPayload>({ title: null, description: null });
  protected readonly saveState = signal<MetaSaveState>('idle');

  /** Actif quand le formulaire diffère du dernier enregistré (et pas en vol). */
  protected readonly canSave = computed(() => {
    this.#value();
    if (this.saveState() === 'saving') {
      return false;
    }
    return (
      JSON.stringify(payloadFromBlockMetaForm(this.form)) !==
      JSON.stringify(this.#savedPayload())
    );
  });

  constructor() {
    // Ré-éditer efface le badge « Enregistré/Échec » (mais pas pendant un save).
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.saveState() !== 'saving') {
        this.saveState.set('idle');
      }
    });
  }

  ngOnInit(): void {
    patchBlockMetaForm(this.form, this.block());
    this.#savedPayload.set(payloadFromBlockMetaForm(this.form));
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    const payload = payloadFromBlockMetaForm(this.form);
    this.saveState.set('saving');
    try {
      await this.#courses.updateBlockMeta(this.courseId(), this.blockId(), payload);
      this.#savedPayload.set(payload);
      this.saveState.set('saved');
    } catch {
      this.saveState.set('error');
    }
  }
}
