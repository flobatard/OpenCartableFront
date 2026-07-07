import { Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { SubjectService } from '../../core/subjects/subject.service';
import { SubjectLevel, SubjectNode } from '../../core/subjects/subject.model';
import { allIds, filteredRows, visibleRows } from '../../core/subjects/subject.utils';

const LEVEL_KEYS: Record<SubjectLevel, string> = {
  0: 'subjects.level.discipline',
  1: 'subjects.level.domaine',
  2: 'subjects.level.sousDomaine',
  3: 'subjects.level.sujet',
};

/**
 * Page « Matières » : arbre complet de la taxonomie en treeview (disciplines repliées
 * par défaut, expand/collapse, tout déplier/replier, recherche qui déplie les branches
 * contenant un résultat). États chargement (skeleton) / erreur (retry) / vide soignés.
 */
@Component({
  selector: 'app-subjects',
  imports: [TranslocoPipe],
  templateUrl: './subjects.html',
  styleUrl: './subjects.scss',
})
export class Subjects {
  readonly #subjects = inject(SubjectService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly tree = this.#subjects.tree;
  protected readonly loading = this.#subjects.loading;
  protected readonly error = this.#subjects.error;

  protected readonly search = signal('');
  protected readonly activeId = signal<string | null>(null);
  readonly #expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly searching = computed(() => this.search().trim().length > 0);

  protected readonly rows = computed(() =>
    this.searching()
      ? filteredRows(this.tree(), this.search())
      : visibleRows(this.tree(), this.#expanded()),
  );

  protected readonly isEmpty = computed(
    () => !this.loading() && !this.error() && this.rows().length === 0,
  );

  readonly #navIds = computed(() => this.rows().map((r) => r.node.id));

  constructor() {
    if (this.#isBrowser) {
      this.#subjects.load();
    }
  }

  protected retry(): void {
    this.#subjects.reload();
  }

  protected levelKey(profondeur: SubjectLevel): string {
    return LEVEL_KEYS[profondeur];
  }

  // --- Expansion --------------------------------------------------------------

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected expandAll(): void {
    this.#expanded.set(new Set(allIds(this.tree())));
  }

  protected collapseAll(): void {
    this.#expanded.set(new Set());
  }

  protected toggleNode(node: SubjectNode): void {
    this.#setExpanded(node.id, !this.#expanded().has(node.id));
  }

  #setExpanded(id: string, expanded: boolean): void {
    const next = new Set(this.#expanded());
    expanded ? next.add(id) : next.delete(id);
    this.#expanded.set(next);
  }

  // --- Clavier (treeview) -----------------------------------------------------

  protected activeDomId(): string | null {
    const id = this.activeId();
    return id ? `subject-node-${id}` : null;
  }

  protected onKeydown(event: KeyboardEvent): void {
    const rows = this.rows();
    if (!rows.length) {
      return;
    }
    if (this.activeId() === null) {
      this.activeId.set(rows[0].node.id);
    }
    const row = rows.find((r) => r.node.id === this.activeId());
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.#moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.#moveActive(-1);
        break;
      case 'ArrowRight':
        if (row && !this.searching() && row.hasChildren && !row.expanded) {
          event.preventDefault();
          this.#setExpanded(row.node.id, true);
        }
        break;
      case 'ArrowLeft':
        if (row && !this.searching() && row.expanded) {
          event.preventDefault();
          this.#setExpanded(row.node.id, false);
        }
        break;
      case 'Enter':
      case ' ':
        if (row?.hasChildren && !this.searching()) {
          event.preventDefault();
          this.toggleNode(row.node);
        }
        break;
    }
  }

  #moveActive(delta: number): void {
    const ids = this.#navIds();
    const current = ids.indexOf(this.activeId() ?? '');
    const next = Math.min(ids.length - 1, Math.max(0, current + delta));
    this.activeId.set(ids[next]);
  }
}
