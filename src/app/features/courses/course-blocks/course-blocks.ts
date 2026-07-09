import {
  Component,
  ElementRef,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { BlockMetaPayload, BlockType, CourseBlock } from '../../../core/courses/course.model';
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
import { CourseResources } from '../course-resources/course-resources';
import { moveIdTo } from './course-blocks.utils';

/** Types proposés à l'ajout — tous créables (module = placeholder J4). */
const CREATABLE_TYPES: readonly BlockType[] = ['texte', 'exercice', 'document', 'module'];

/** Suffixe d'ids ARIA uniques par instance (compteur de module, jamais Date/Random). */
let sequence = 0;

type CourseTab = 'blocks' | 'resources';

/**
 * Page d'un cours, à deux onglets (tablist APG, motif `markdown-field`) :
 * « Blocs » — liste ordonnée des blocs, ajout par type (via une modale
 * titre/description puis redirection vers l'éditeur du bloc créé),
 * réordonnancement par glisser-déposer (poignée CDK) ou flèches discrètes — la
 * poignée est aussi opérable au clavier ; l'affichage est optimiste, mais une
 * mutation en vol fige les actions le temps de l'aller-retour — et suppression
 * en deux temps (le bouton s'arme puis confirme — pas de modale) ; et
 * « Ressources » — bibliothèque de fichiers du cours (`CourseResources`),
 * indépendante des blocs. L'onglet actif est reflété dans `?tab=resources`
 * (deep-link, `replaceUrl` pour ne pas polluer l'historique) ; panneaux en
 * `@if` (pas de Monaco ici, rien à préserver dans le DOM).
 */
@Component({
  selector: 'app-course-blocks',
  imports: [
    RouterLink,
    TranslocoPipe,
    BlockCreateDialog,
    CourseResources,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
  ],
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
  protected readonly courseId = this.#courseId;

  /** Modale de création (saisie titre/description avant l'ajout du bloc). */
  protected readonly createDialog = viewChild(BlockCreateDialog);

  /** Préfixe d'ids ARIA du tablist, propre à l'instance. */
  protected readonly uid = `course-tabs-${sequence++}`;

  /** Onglet actif, initialisé depuis `?tab=` (retour d'éditeur → Blocs). */
  protected readonly activeTab = signal<CourseTab>(
    inject(ActivatedRoute).snapshot.queryParamMap.get('tab') === 'resources'
      ? 'resources'
      : 'blocks',
  );

  protected readonly blocksTabRef = viewChild<ElementRef<HTMLButtonElement>>('blocksTab');
  protected readonly resourcesTabRef = viewChild<ElementRef<HTMLButtonElement>>('resourcesTab');

  protected readonly detail = this.#courses.detail;
  protected readonly loading = this.#courses.detailLoading;
  protected readonly loadError = this.#courses.detailError;

  protected readonly creatableTypes = CREATABLE_TYPES;

  /** Une mutation en vol : fige monter/descendre/supprimer/ajouter. */
  protected readonly mutating = signal(false);
  protected readonly mutationError = signal(false);
  /** Id du bloc « armé » pour suppression (le 2e clic confirme). */
  protected readonly pendingDelete = signal<string | null>(null);
  /** Cours « armé » pour suppression (le 2e clic confirme, puis retour à la liste). */
  protected readonly pendingCourseDelete = signal(false);

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

  /** Bascule d'onglet, reflétée dans `?tab=` (deep-link sans polluer l'historique). */
  protected selectTab(tab: CourseTab): void {
    this.activeTab.set(tab);
    void this.#router.navigate([], {
      queryParams: { tab: tab === 'resources' ? 'resources' : null },
      replaceUrl: true,
    });
  }

  /** Flèches gauche/droite : bascule d'onglet + déplacement du focus (APG tabs). */
  protected onTablistKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const next: CourseTab = this.activeTab() === 'blocks' ? 'resources' : 'blocks';
    this.selectTab(next);
    const ref = next === 'blocks' ? this.blocksTabRef() : this.resourcesTabRef();
    ref?.nativeElement.focus();
  }

  /**
   * Une ressource a été supprimée : les blocs `document` qui la pointaient
   * ont été supprimés par le serveur (FK CASCADE) — on recharge le détail.
   */
  protected onResourceDeleted(): void {
    this.reload();
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
  protected openCreate(type: BlockType): void {
    this.createDialog()?.open(type);
  }

  /** Crée le bloc avec son méta puis redirige vers son éditeur. */
  protected async confirmCreate(event: {
    type: BlockType;
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

  /** Flèche monter/descendre : délègue au réordonnancement index→index. */
  protected move(block: CourseBlock, delta: -1 | 1): void {
    const from = this.detail()?.blocks.findIndex((b) => b.id === block.id) ?? -1;
    void this.#reorderTo(from, from + delta);
  }

  /** Fin d'un glisser-déposer : réordonne de `previousIndex` vers `currentIndex`. */
  protected drop(event: CdkDragDrop<CourseBlock[]>): void {
    void this.#reorderTo(event.previousIndex, event.currentIndex);
  }

  /** Clavier sur la poignée : ↑/↓ un cran, Début/Fin aux extrémités. */
  protected onHandleKeydown(event: KeyboardEvent, index: number, count: number): void {
    const to =
      event.key === 'ArrowUp'
        ? index - 1
        : event.key === 'ArrowDown'
          ? index + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : null;
    if (to === null) {
      return;
    }
    event.preventDefault();
    void this.#reorderTo(index, to);
  }

  /**
   * Réordonne les blocs de `from` vers `to`. L'affichage est optimiste (le
   * service patche le signal `detail` avant le PUT), mais `mutating` fige les
   * actions le temps de l'aller-retour ; sur erreur, on resynchronise. No-op
   * hors bornes ou si aucune mutation n'est nécessaire.
   */
  async #reorderTo(from: number, to: number): Promise<void> {
    const detail = this.detail();
    if (!detail || this.mutating() || from === to) {
      return;
    }
    const count = detail.blocks.length;
    if (from < 0 || from >= count || to < 0 || to >= count) {
      return;
    }
    this.#startMutation();
    try {
      const ids = moveIdTo(
        detail.blocks.map((b) => b.id),
        from,
        to,
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

  /** Supprime le cours entier (deux temps) puis revient à « Mes cours ». */
  protected async removeCourse(): Promise<void> {
    if (this.mutating()) {
      return;
    }
    if (!this.pendingCourseDelete()) {
      this.pendingCourseDelete.set(true);
      return;
    }
    this.#startMutation();
    try {
      await this.#courses.deleteCourse(this.#courseId);
      // mutating reste posé le temps de la nav : la page va être détruite.
      await this.#router.navigate(['/', this.language.lang(), 'courses']);
    } catch {
      this.mutationError.set(true);
      this.mutating.set(false);
    }
  }

  /** Quitter le bouton armé (focus ailleurs) annule la suppression du cours. */
  protected disarmCourseDelete(): void {
    this.pendingCourseDelete.set(false);
  }

  #startMutation(): void {
    this.mutating.set(true);
    this.mutationError.set(false);
    this.pendingDelete.set(null);
    this.pendingCourseDelete.set(false);
  }
}
