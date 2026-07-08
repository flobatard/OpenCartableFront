import { Component, inject, OnInit, PLATFORM_ID, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  BlockMetaPayload,
  CourseBlock,
  CreatableBlockType,
} from '../../../core/courses/course.model';
import { CourseService } from '../../../core/courses/course.service';
import { EducationLevelService } from '../../../core/education-levels/education-level.service';
import {
  findById as findLevelById,
  sortByTreeOrder,
} from '../../../core/education-levels/education-level.utils';
import { LanguageService } from '../../../core/i18n/language.service';
import { SubjectService } from '../../../core/subjects/subject.service';
import { findById as findSubjectById } from '../../../core/subjects/subject.utils';
import { BlockCreateDialog } from '../block-create-dialog/block-create-dialog';
import { moveId } from './course-blocks.utils';

/** Types proposés à l'ajout — « ressource » attend l'upload S3 (bouton désactivé). */
const CREATABLE_TYPES: readonly CreatableBlockType[] = ['texte', 'exercice', 'lien'];

/**
 * Espace blocs d'un cours : liste ordonnée des blocs, ajout par type (via une
 * modale titre/description puis redirection vers l'éditeur du bloc créé),
 * réordonnancement par boutons monter/descendre (approche pessimiste : les
 * actions sont figées le temps d'une mutation) et suppression en deux temps
 * (le bouton s'arme puis confirme — pas de modale).
 */
@Component({
  selector: 'app-course-blocks',
  imports: [RouterLink, TranslocoPipe, BlockCreateDialog],
  templateUrl: './course-blocks.html',
  styleUrl: './course-blocks.scss',
})
export class CourseBlocks implements OnInit {
  readonly #courses = inject(CourseService);
  readonly #subjects = inject(SubjectService);
  readonly #levels = inject(EducationLevelService);
  readonly #router = inject(Router);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** Param `:id` lu en snapshot (pas de withComponentInputBinding dans ce projet). */
  readonly #courseId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly language = inject(LanguageService);

  /** Modale de création (saisie titre/description avant l'ajout du bloc). */
  protected readonly createDialog = viewChild(BlockCreateDialog);

  protected readonly detail = this.#courses.detail;
  protected readonly loading = this.#courses.detailLoading;
  protected readonly loadError = this.#courses.detailError;

  protected readonly creatableTypes = CREATABLE_TYPES;

  /** Une mutation en vol : fige monter/descendre/supprimer/ajouter. */
  protected readonly mutating = signal(false);
  protected readonly mutationError = signal(false);
  /** Id du bloc « armé » pour suppression (le 2e clic confirme). */
  protected readonly pendingDelete = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.#isBrowser) {
      return;
    }
    this.reload();
    // Arbres de référence : badges matières/niveaux de l'en-tête.
    this.#subjects.load();
    this.#levels.load();
  }

  protected reload(): void {
    this.#courses.loadDetail(this.#courseId);
  }

  /** Noms des matières du cours (id inconnu de l'arbre → pas de chip). */
  protected subjectNames(ids: string[]): string[] {
    return ids
      .map((id) => findSubjectById(this.#subjects.tree(), id)?.nom)
      .filter((nom): nom is string => nom !== undefined);
  }

  /** Noms des niveaux du cours, en ordre d'arbre (id inconnu → pas de chip). */
  protected levelNames(ids: string[]): string[] {
    return sortByTreeOrder(this.#levels.tree(), ids)
      .map((id) => findLevelById(this.#levels.tree(), id)?.nom)
      .filter((nom): nom is string => nom !== undefined);
  }

  /** Ouvre la modale de création pour le type demandé (saisie titre/description). */
  protected openCreate(type: CreatableBlockType): void {
    this.createDialog()?.open(type);
  }

  /** Crée le bloc avec son méta puis redirige vers son éditeur. */
  protected async confirmCreate(event: {
    type: CreatableBlockType;
    meta: BlockMetaPayload;
  }): Promise<void> {
    if (this.mutating()) {
      return;
    }
    this.#startMutation();
    try {
      const block = await this.#courses.addBlock(this.#courseId, event.type, event.meta);
      // Droit vers l'éditeur du bloc créé (mutating reste posé le temps de la nav).
      await this.#router.navigate([
        '/',
        this.language.lang(),
        'courses',
        this.#courseId,
        'blocks',
        block.id,
      ]);
    } catch {
      this.mutationError.set(true);
      this.mutating.set(false);
    }
  }

  protected async move(block: CourseBlock, delta: -1 | 1): Promise<void> {
    const detail = this.detail();
    if (!detail || this.mutating()) {
      return;
    }
    this.#startMutation();
    try {
      const ids = moveId(
        detail.blocks.map((b) => b.id),
        block.id,
        delta,
      );
      await this.#courses.reorderBlocks(this.#courseId, ids);
    } catch {
      this.mutationError.set(true);
      // Resynchronise l'ordre réel (ex. blocs modifiés dans un autre onglet).
      this.reload();
    } finally {
      this.mutating.set(false);
    }
  }

  protected async remove(block: CourseBlock): Promise<void> {
    if (this.mutating()) {
      return;
    }
    if (this.pendingDelete() !== block.id) {
      this.pendingDelete.set(block.id);
      return;
    }
    this.#startMutation();
    try {
      await this.#courses.deleteBlock(this.#courseId, block.id);
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
