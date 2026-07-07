import {
  Component,
  ElementRef,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { SubjectService } from '../../core/subjects/subject.service';
import { SubjectNode } from '../../core/subjects/subject.model';
import {
  ancestorPath,
  findById,
  flattenFiltered,
  formatPath,
  visibleRows,
} from '../../core/subjects/subject.utils';

/** Compteur d'instances : ids ARIA uniques quand plusieurs pickers coexistent. */
let pickerUid = 0;

/**
 * Sélecteur d'UNE matière dans la taxonomie, utilisable en Reactive Forms
 * (`ControlValueAccessor`, valeur = `id` du nœud). Champ + dropdown en arbre
 * déplié/repliable, recherche à tous les niveaux (affichant le chemin), navigation clavier
 * et attributs ARIA de treeview.
 */
@Component({
  selector: 'app-subject-picker',
  imports: [TranslocoPipe],
  templateUrl: './subject-picker.html',
  styleUrl: './subject-picker.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SubjectPicker),
      multi: true,
    },
  ],
})
export class SubjectPicker implements ControlValueAccessor {
  /** Restreint la sélection aux feuilles (les nœuds avec enfants restent affichés, grisés). */
  readonly leavesOnly = input(false);
  /** Restreint la sélection aux nœuds de `profondeur <= maxDepth` (null = sans limite). */
  readonly maxDepth = input<number | null>(null);

  readonly #subjects = inject(SubjectService);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #uid = pickerUid++;

  protected readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  protected readonly tree = this.#subjects.tree;
  protected readonly value = signal<string | null>(null);
  protected readonly disabled = signal(false);
  protected readonly open = signal(false);
  protected readonly search = signal('');
  protected readonly activeId = signal<string | null>(null);
  readonly #expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly listId = `subject-picker-${this.#uid}-list`;

  protected readonly mode = computed<'browse' | 'search'>(() =>
    this.search().trim() ? 'search' : 'browse',
  );

  /** Lignes de l'arbre en mode navigation. */
  protected readonly rows = computed(() => visibleRows(this.tree(), this.#expanded()));

  /** Résultats plats (avec chemin) en mode recherche. */
  protected readonly matches = computed(() => flattenFiltered(this.tree(), this.search()));

  /** Chemin complet du nœud sélectionné, résolu une fois l'arbre chargé. */
  protected readonly selectedLabel = computed(() => {
    const id = this.value();
    if (!id) {
      return '';
    }
    const path = ancestorPath(this.tree(), id);
    return path.length ? formatPath(path) : '';
  });

  /** Ids navigables au clavier dans le mode courant. */
  readonly #navIds = computed(() =>
    this.mode() === 'search'
      ? this.matches().map((m) => m.node.id)
      : this.rows().map((r) => r.node.id),
  );

  #onChange: (value: string | null) => void = () => {};
  #onTouched: () => void = () => {};

  protected readonly formatPath = formatPath;

  constructor() {
    if (this.#isBrowser) {
      this.#subjects.load();
    }
    // Ouvre le dropdown → focus la zone de recherche (le champ rendu par le @if).
    effect(() => {
      if (this.open()) {
        this.searchInput()?.nativeElement.focus();
      }
    });
    // Garde un élément actif valide dans la liste courante.
    effect(() => {
      const ids = this.#navIds();
      if (this.open() && ids.length && !ids.includes(this.activeId() ?? '')) {
        this.activeId.set(ids[0]);
      }
    });
  }

  // --- ControlValueAccessor ---------------------------------------------------

  writeValue(id: string | null): void {
    this.value.set(id ?? null);
  }

  registerOnChange(fn: (value: string | null) => void): void {
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

  // --- Sélection --------------------------------------------------------------

  protected isSelectable(node: SubjectNode): boolean {
    if (this.leavesOnly() && node.children.length > 0) {
      return false;
    }
    const max = this.maxDepth();
    if (max !== null && node.profondeur > max) {
      return false;
    }
    return true;
  }

  protected select(node: SubjectNode): void {
    if (!this.isSelectable(node)) {
      return;
    }
    this.value.set(node.id);
    this.#onChange(node.id);
    this.#close();
  }

  protected domId(node: SubjectNode): string {
    return `subject-picker-${this.#uid}-${node.id}`;
  }

  protected activeDomId(): string | null {
    const id = this.activeId();
    return id ? `subject-picker-${this.#uid}-${id}` : null;
  }

  // --- Ouverture / fermeture --------------------------------------------------

  protected toggle(): void {
    if (this.disabled()) {
      return;
    }
    this.open() ? this.#close() : this.open.set(true);
  }

  #close(): void {
    this.open.set(false);
    this.search.set('');
    this.#onTouched();
  }

  /** Ferme si le focus quitte le composant (clic/tab en dehors). */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.#host.nativeElement.contains(next)) {
      this.#close();
    }
  }

  // --- Expansion --------------------------------------------------------------

  protected toggleNode(event: Event, node: SubjectNode): void {
    event.stopPropagation();
    this.#setExpanded(node.id, !this.#expanded().has(node.id));
  }

  #setExpanded(id: string, expanded: boolean): void {
    const next = new Set(this.#expanded());
    expanded ? next.add(id) : next.delete(id);
    this.#expanded.set(next);
  }

  // --- Recherche & clavier ----------------------------------------------------

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected onNavKeydown(event: KeyboardEvent): void {
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
        this.#expandActive(event);
        break;
      case 'ArrowLeft':
        this.#collapseActive(event);
        break;
      case 'Enter': {
        event.preventDefault();
        const node = this.#activeNode();
        if (node) {
          this.select(node);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.#close();
        this.searchInput()?.nativeElement.blur();
        break;
    }
  }

  #moveActive(delta: number): void {
    const ids = this.#navIds();
    if (!ids.length) {
      return;
    }
    const current = ids.indexOf(this.activeId() ?? '');
    const next = Math.min(ids.length - 1, Math.max(0, current + delta));
    this.activeId.set(ids[next]);
  }

  #expandActive(event: KeyboardEvent): void {
    if (this.mode() !== 'browse') {
      return;
    }
    const row = this.rows().find((r) => r.node.id === this.activeId());
    if (row?.hasChildren && !row.expanded) {
      event.preventDefault();
      this.#setExpanded(row.node.id, true);
    } else if (row?.hasChildren) {
      event.preventDefault();
      this.#moveActive(1);
    }
  }

  #collapseActive(event: KeyboardEvent): void {
    if (this.mode() !== 'browse') {
      return;
    }
    const row = this.rows().find((r) => r.node.id === this.activeId());
    if (row?.expanded) {
      event.preventDefault();
      this.#setExpanded(row.node.id, false);
    }
  }

  #activeNode(): SubjectNode | undefined {
    const id = this.activeId();
    return id ? findById(this.tree(), id) : undefined;
  }
}
