import { Component, computed, effect, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { DocumentContentPayload } from '../../../core/courses/course.model';
import {
  buildDocumentForm,
  patchDocumentFormFromContent,
  payloadFromDocumentForm,
} from '../../../core/courses/document-form';
import { CourseResource } from '../../../core/resources/resource.model';
import { CoursePreviewDocument } from '../../../shared/course-blocks-view/course-preview-document';

/**
 * Éditeur du contenu d'un bloc document — présentationnel (motif
 * `ExerciseEditor`, en beaucoup plus simple, sans Monaco ni onglets) :
 * un `<select>` natif choisit la ressource du cours (liste plate courte —
 * pas de treeview), la légende et le mode d'affichage forment l'éditorial.
 * `[initial]` est lu une seule fois ; chaque frappe remonte par
 * `(contentChange)` (pipeline d'autosave du parent), tandis que le choix de
 * ressource remonte par `(resourcePick)` — le parent PATCHe immédiatement
 * (sélection discrète, pas une frappe) et appelle `resetResource` sur échec.
 * `form` et `resourceControl` sont publics : les specs jsdom les pilotent.
 *
 * Aperçu embarqué : la ressource sélectionnée est rendue sous le picker par
 * `CoursePreviewDocument` (le rendu exact de l'élève — l'enfant injecte le
 * résolveur prof par défaut, ce composant reste sans service). Réactivité par
 * signaux miroirs posés directement (`#selectedId`, `#editorial`) et JAMAIS
 * `toSignal(valueChanges)` : toutes les écritures de synchronisation du
 * formulaire sont en `emitEvent: false` (motif module-editor, « signaux posés
 * directement, sinon preview vide »).
 */
@Component({
  selector: 'app-document-editor',
  imports: [ReactiveFormsModule, TranslocoPipe, CoursePreviewDocument],
  templateUrl: './document-editor.html',
  styleUrl: './document-editor.scss',
})
export class DocumentEditor implements OnInit {
  /** Cours hôte — descendu à l'aperçu embarqué (présignature). */
  readonly courseId = input.required<string>();
  /** `content` du bloc, lu UNE SEULE FOIS à l'init (jamais réécrit ensuite). */
  readonly initial = input.required<Record<string, unknown>>();
  /** Ressource pointée par le bloc (source de vérité : le signal `detail`). */
  readonly resourceId = input.required<string | null>();
  /** Ressources `disponible` du cours, proposées par le picker. */
  readonly resources = input.required<CourseResource[]>();

  /** Éditorial (légende/affichage) — chaque frappe, pour l'autosave du parent. */
  readonly contentChange = output<DocumentContentPayload>();
  /** Choix de ressource (`null` = détacher) — PATCH immédiat côté parent. */
  readonly resourcePick = output<string | null>();

  readonly form = buildDocumentForm();

  /** Valeur du `<select>` (`''` = aucune ressource). */
  readonly resourceControl = new FormControl('', { nonNullable: true });

  /** Miroir signal du select (les `setValue` de sync n'émettent pas). */
  readonly #selectedId = signal<string | null>(null);

  /** Ressource sélectionnée, résolue dans la liste (aperçu embarqué). */
  protected readonly selectedResource = computed(() => {
    const id = this.#selectedId();
    return id === null ? undefined : this.resources().find((r) => r.id === id);
  });

  /** Éditorial courant (légende/affichage) — aperçu WYSIWYG en direct. */
  readonly #editorial = signal<DocumentContentPayload>({ legende: null, affichage: 'inline' });
  protected readonly editorial = this.#editorial.asReadonly();

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const payload = payloadFromDocumentForm(this.form);
      this.#editorial.set(payload);
      this.contentChange.emit(payload);
    });
    this.resourceControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      const id = value === '' ? null : value;
      // Aperçu optimiste : le PATCH du parent confirmera via `resourceId`.
      this.#selectedId.set(id);
      this.resourcePick.emit(id);
    });
    // Le select suit le bloc (patch du détail post-PATCH, suppression de la
    // ressource pointée…) ; un id absent de la liste → option vide.
    effect(() => {
      const id = this.resourceId();
      const known = id !== null && this.resources().some((r) => r.id === id);
      this.resourceControl.setValue(known ? (id as string) : '', { emitEvent: false });
      this.#selectedId.set(known ? id : null);
    });
  }

  ngOnInit(): void {
    patchDocumentFormFromContent(this.form, this.initial());
    // Seed de l'aperçu : le patch ci-dessus n'émet pas (`emitEvent: false`) —
    // sans ce set, l'aperçu resterait figé sur les défauts du formulaire.
    this.#editorial.set(payloadFromDocumentForm(this.form));
  }

  /** Rétablit le select après un PATCH en échec (appelé par le parent). */
  resetResource(id: string | null): void {
    const known = id !== null && this.resources().some((r) => r.id === id);
    this.resourceControl.setValue(known ? (id as string) : '', { emitEvent: false });
    this.#selectedId.set(known ? id : null);
  }
}
