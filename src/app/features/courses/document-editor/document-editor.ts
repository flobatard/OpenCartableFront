import { Component, effect, input, OnInit, output } from '@angular/core';
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
 */
@Component({
  selector: 'app-document-editor',
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './document-editor.html',
  styleUrl: './document-editor.scss',
})
export class DocumentEditor implements OnInit {
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

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.contentChange.emit(payloadFromDocumentForm(this.form));
    });
    this.resourceControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.resourcePick.emit(value === '' ? null : value);
    });
    // Le select suit le bloc (patch du détail post-PATCH, suppression de la
    // ressource pointée…) ; un id absent de la liste → option vide.
    effect(() => {
      const id = this.resourceId();
      const known = id !== null && this.resources().some((r) => r.id === id);
      this.resourceControl.setValue(known ? (id as string) : '', { emitEvent: false });
    });
  }

  ngOnInit(): void {
    patchDocumentFormFromContent(this.form, this.initial());
  }

  /** Rétablit le select après un PATCH en échec (appelé par le parent). */
  resetResource(id: string | null): void {
    const known = id !== null && this.resources().some((r) => r.id === id);
    this.resourceControl.setValue(known ? (id as string) : '', { emitEvent: false });
  }
}
