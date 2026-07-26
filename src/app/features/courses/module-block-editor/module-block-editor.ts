import { Component, effect, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { ModuleSummary } from '../../../core/modules/module.model';
import { ModuleEmbed } from '../../../shared/module-runner/module-embed';

/**
 * Éditeur du contenu d'un bloc module — présentationnel (motif
 * `DocumentEditor`, sans éditorial) : un `<select>` natif choisit le module
 * de la bibliothèque du cours ; en dessous, l'aperçu sandbox (`ModuleEmbed`)
 * et un lien « Modifier ce module » vers l'éditeur de code. Le choix remonte
 * par `(modulePick)` — le parent PATCHe immédiatement (sélection discrète,
 * pas une frappe) et appelle `resetModule` sur échec. `moduleControl` est
 * public : les specs jsdom le pilotent.
 */
@Component({
  selector: 'app-module-block-editor',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, ModuleEmbed],
  templateUrl: './module-block-editor.html',
  styleUrl: './module-block-editor.scss',
})
export class ModuleBlockEditor {
  protected readonly language = inject(LanguageService);

  readonly courseId = input.required<string>();
  /** Module pointé par le bloc (source de vérité : le signal `detail`). */
  readonly moduleId = input.required<string | null>();
  /** Modules du cours, proposés par le picker. */
  readonly modules = input.required<ModuleSummary[]>();

  /** Choix de module (`null` = détacher) — PATCH immédiat côté parent. */
  readonly modulePick = output<string | null>();

  /** Valeur du `<select>` (`''` = aucun module). */
  readonly moduleControl = new FormControl('', { nonNullable: true });

  constructor() {
    this.moduleControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.modulePick.emit(value === '' ? null : value);
    });
    // Le select suit le bloc (patch du détail post-PATCH, suppression du
    // module pointé…) ; un id absent de la liste → option vide.
    effect(() => {
      const id = this.moduleId();
      const known = id !== null && this.modules().some((m) => m.id === id);
      this.moduleControl.setValue(known ? (id as string) : '', { emitEvent: false });
    });
  }

  /** Rétablit le select après un PATCH en échec (appelé par le parent). */
  resetModule(id: string | null): void {
    const known = id !== null && this.modules().some((m) => m.id === id);
    this.moduleControl.setValue(known ? (id as string) : '', { emitEvent: false });
  }
}
