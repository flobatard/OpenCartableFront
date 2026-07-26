import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { ModuleSummary } from '../../../core/modules/module.model';
import { ModuleService } from '../../../core/modules/module.service';

/**
 * Onglet « Modules » d'un cours : bibliothèque des modules interactifs
 * HTML/CSS/JS, indépendante des blocs (motif `CourseResources`, sans upload —
 * le code vit en base). Création inline (titre seul) suivie d'une
 * REDIRECTION vers l'éditeur du module créé (motif `confirmCreate` des
 * blocs), renommage inline (Échap annule), lien « Modifier » vers l'éditeur
 * et suppression en deux temps désarmée au blur. Après une suppression,
 * l'output `deleted` prévient la page : les blocs `module` pointeurs ont été
 * supprimés PAR LE SERVEUR (FK CASCADE), le détail du cours doit être
 * rechargé.
 */
@Component({
  selector: 'app-course-modules',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './course-modules.html',
  styleUrl: './course-modules.scss',
})
export class CourseModules implements OnInit {
  readonly #modules = inject(ModuleService);
  readonly #router = inject(Router);
  protected readonly language = inject(LanguageService);

  readonly courseId = input.required<string>();

  /** Un module a été supprimé — la page resynchronise les blocs module. */
  readonly deleted = output<void>();

  protected readonly list = this.#modules.list;
  protected readonly loading = this.#modules.listLoading;
  protected readonly loadError = this.#modules.listError;

  /** Une mutation en vol (création/renommage/suppression) fige les actions. */
  protected readonly mutating = signal(false);
  protected readonly mutationError = signal(false);
  /** Id du module « armé » pour suppression (le 2e clic confirme). */
  protected readonly pendingDelete = signal<string | null>(null);
  /** Id du module en cours de renommage inline (`null` = aucun). */
  protected readonly renamingId = signal<string | null>(null);

  /** Titre du module à créer. Public : les specs le pilotent. */
  readonly createControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(255)],
  });

  /** Titre saisi pendant le renommage inline. Public : les specs le pilotent. */
  readonly renameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(255)],
  });

  ngOnInit(): void {
    this.reload();
  }

  protected reload(): void {
    this.#modules.loadList(this.courseId());
  }

  /** Date d'ajout dans la locale de l'UI (pas de DatePipe : locale fr non enregistrée). */
  protected addedOn(iso: string): string {
    return new Date(iso).toLocaleDateString(this.language.lang());
  }

  /** Crée le module (code vide) puis ouvre directement son éditeur. */
  protected async create(): Promise<void> {
    const titre = this.createControl.value.trim();
    if (!titre || this.mutating()) {
      return;
    }
    this.#startMutation();
    try {
      const module = await this.#modules.createModule(this.courseId(), { titre });
      this.createControl.setValue('');
      await this.#router.navigate([
        '/',
        this.language.lang(),
        'courses',
        this.courseId(),
        'modules',
        module.id,
      ]);
    } catch {
      this.mutationError.set(true);
    } finally {
      this.mutating.set(false);
    }
  }

  protected startRename(module: ModuleSummary): void {
    this.renamingId.set(module.id);
    this.renameControl.setValue(module.titre);
    this.mutationError.set(false);
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
  }

  protected async saveRename(module: ModuleSummary): Promise<void> {
    const titre = this.renameControl.value.trim();
    if (!titre || this.mutating()) {
      return;
    }
    this.#startMutation();
    try {
      await this.#modules.renameModule(this.courseId(), module.id, titre);
      this.renamingId.set(null);
    } catch {
      this.mutationError.set(true);
    } finally {
      this.mutating.set(false);
    }
  }

  protected async remove(module: ModuleSummary): Promise<void> {
    if (this.mutating()) {
      return;
    }
    if (this.pendingDelete() !== module.id) {
      this.pendingDelete.set(module.id);
      return;
    }
    this.#startMutation();
    try {
      await this.#modules.deleteModule(this.courseId(), module.id);
      this.deleted.emit();
    } catch {
      this.mutationError.set(true);
    } finally {
      this.mutating.set(false);
    }
  }

  /** Quitter le bouton armé (focus ailleurs) annule la suppression. */
  protected disarmDelete(): void {
    this.pendingDelete.set(null);
  }

  #startMutation(): void {
    this.mutating.set(true);
    this.mutationError.set(false);
    this.pendingDelete.set(null);
  }
}
