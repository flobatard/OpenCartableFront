import { Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { PublicEducationLevelService } from '../../core/education-levels/public-education-level.service';
import { flattenTree } from '../../core/education-levels/education-level.utils';
import { LanguageService } from '../../core/i18n/language.service';
import { SearchQuery } from '../../core/search/search.model';
import { SearchService } from '../../core/search/search.service';
import { PublicSubjectService } from '../../core/subjects/public-subject.service';
import { allIds, visibleRows } from '../../core/subjects/subject.utils';
import { PublicCourseCard } from '../../shared/public-course-card/public-course-card';
import { Spinner } from '../../shared/spinner/spinner';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';
import { Tablist } from '../../shared/tabs/tablist.directive';

/** Suffixe d'ids ARIA uniques par instance (compteur de module, jamais Date/Random). */
let sequence = 0;

type SearchTab = 'courses' | 'teachers';

/** Ordre des onglets pour la navigation clavier ←/→ (APG tabs). */
const TAB_ORDER: readonly SearchTab[] = ['courses', 'teachers'];

/** Une option de facette : id + libellé indenté selon la profondeur d'arbre. */
interface FacetOption {
  id: string;
  label: string;
}

/** Indentation d'une option de `<select>` (espaces insécables, 2 par niveau). */
function indent(label: string, depth: number): string {
  return `${' '.repeat(depth * 2)}${label}`;
}

/**
 * Page de recherche publique (`/:lang/search`, J3) : cours publics et
 * professeurs cherchables, sans compte — c'est le point d'entrée transversal
 * du site pour un élève sans lien de partage. Sans texte libre, la page est
 * un catalogue (le back trie alors par `updated_at`).
 *
 * L'état (q, onglet, facettes, page) vit dans les **query params** (URL
 * partageable, motif `?tab=` de course-blocks : seed en snapshot, défauts
 * retirés de l'URL, `replaceUrl` — back/forward ne rejoue pas l'état,
 * limite assumée du motif). Les facettes sont deux `<select>` natifs
 * mono-valeur alimentés par les arbres publics (`/v1/public/subjects/tree`
 * et `/v1/public/education-levels/tree`) — la facette back est mono-valeur,
 * les pickers CVA multi restent aux pages prof. Client-only
 * (`RenderMode.Client`).
 */
@Component({
  selector: 'app-search',
  imports: [Tablist, TranslocoPipe, ReactiveFormsModule, RouterLink, PublicCourseCard, Spinner, UserAvatar],
  templateUrl: './search.html',
  styleUrl: './search.scss',
})
export class Search {
  readonly #search = inject(SearchService);
  readonly #subjects = inject(PublicSubjectService);
  readonly #levels = inject(PublicEducationLevelService);
  readonly #router = inject(Router);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly language = inject(LanguageService);

  /** Préfixe d'ids ARIA du tablist, propre à l'instance. */
  protected readonly uid = `search-tabs-${sequence++}`;

  // État seedé une fois depuis l'URL (snapshot, convention repo).
  protected readonly activeTab = signal<SearchTab>('courses');
  protected readonly q = signal('');
  protected readonly subjectId = signal<string | null>(null);
  protected readonly levelId = signal<string | null>(null);
  protected readonly page = signal(1);

  /** Public (exception à la convention `protected`) : les specs le pilotent. */
  readonly searchControl = new FormControl('', { nonNullable: true });

  protected readonly coursesPage = this.#search.coursesPage;
  protected readonly coursesLoading = this.#search.coursesLoading;
  protected readonly coursesError = this.#search.coursesError;
  protected readonly teachersPage = this.#search.teachersPage;
  protected readonly teachersLoading = this.#search.teachersLoading;
  protected readonly teachersError = this.#search.teachersError;

  /** Options du `<select>` matière : arbre entier aplati, libellés indentés. */
  protected readonly subjectOptions = computed<FacetOption[]>(() => {
    const tree = this.#subjects.tree();
    return visibleRows(tree, new Set(allIds(tree))).map((row) => ({
      id: row.node.id,
      label: indent(row.node.name, row.depth),
    }));
  });

  /** Options du `<select>` niveau (cycles + classes, tous systèmes). */
  protected readonly levelOptions = computed<FacetOption[]>(() =>
    flattenTree(this.#levels.tree()).map((row) => ({
      id: row.node.id,
      label: indent(row.node.name, row.depth),
    })),
  );

  protected readonly hasFilters = computed(
    () => this.subjectId() !== null || this.levelId() !== null,
  );

  /** Pagination de l'onglet actif (bornes 1-indexées pour l'affichage). */
  protected readonly pagination = computed(() => {
    const page = this.activeTab() === 'courses' ? this.coursesPage() : this.teachersPage();
    if (page === null || page.total === 0) {
      return null;
    }
    return {
      start: page.offset + 1,
      end: page.offset + page.items.length,
      total: page.total,
      hasPrev: page.offset > 0,
      hasNext: page.offset + page.items.length < page.total,
    };
  });

  /** Dernière requête émise par onglet — évite de relancer à l'identique. */
  readonly #lastRun: Record<SearchTab, string | null> = { courses: null, teachers: null };

  constructor() {
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    this.activeTab.set(params.get('tab') === 'teachers' ? 'teachers' : 'courses');
    this.q.set(params.get('q') ?? '');
    this.subjectId.set(params.get('subject'));
    this.levelId.set(params.get('level'));
    const page = Number.parseInt(params.get('page') ?? '', 10);
    this.page.set(Number.isNaN(page) || page < 1 ? 1 : page);
    this.searchControl.setValue(this.q(), { emitEvent: false });

    if (!this.#isBrowser) {
      return;
    }
    this.#subjects.load();
    this.#levels.load();
    this.#runActive();
    this.searchControl.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => {
        this.q.set(value);
        this.page.set(1);
        this.#stateChanged();
      });
  }

  protected selectTab(tab: SearchTab): void {
    if (tab === this.activeTab()) {
      return;
    }
    this.activeTab.set(tab);
    // La page courante n'a pas de sens d'un onglet à l'autre.
    this.page.set(1);
    this.#syncUrl();
    this.#runActive();
  }


  /** Onglet atteint au clavier (directive `ocTablist`). */
  protected onTabKey(key: string): void {
    if ((TAB_ORDER as readonly string[]).includes(key)) {
      this.selectTab(key as SearchTab);
    }
  }

  protected onSubjectChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.subjectId.set(value === '' ? null : value);
    this.page.set(1);
    this.#stateChanged();
  }

  protected onLevelChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.levelId.set(value === '' ? null : value);
    this.page.set(1);
    this.#stateChanged();
  }

  protected resetFilters(): void {
    if (!this.hasFilters()) {
      return;
    }
    this.subjectId.set(null);
    this.levelId.set(null);
    this.page.set(1);
    this.#stateChanged();
  }

  protected goToPage(delta: number): void {
    const next = this.page() + delta;
    if (next < 1) {
      return;
    }
    this.page.set(next);
    this.#stateChanged();
  }

  /** Relance de l'onglet actif après une erreur réseau. */
  protected retry(): void {
    this.#runActive(true);
  }

  /** Lien d'un cours (régime public par id) — même cible que le catalogue. */
  protected courseLink(courseId: string): string[] {
    return ['/', this.language.lang(), 'p', 'courses', courseId];
  }

  /** Lien du catalogue public d'un prof. */
  protected teacherLink(teacherId: string): string[] {
    return ['/', this.language.lang(), 'p', teacherId];
  }

  #stateChanged(): void {
    // Les deux onglets repartent de la nouvelle requête (l'inactif relancera
    // à sa prochaine activation).
    this.#lastRun.courses = null;
    this.#lastRun.teachers = null;
    this.#syncUrl();
    this.#runActive();
  }

  /** Sérialise l'état vers l'URL — défauts retirés, sans polluer l'historique. */
  #syncUrl(): void {
    void this.#router.navigate([], {
      queryParams: {
        q: this.q().trim() === '' ? null : this.q(),
        tab: this.activeTab() === 'courses' ? null : this.activeTab(),
        subject: this.subjectId(),
        level: this.levelId(),
        page: this.page() > 1 ? this.page() : null,
      },
      replaceUrl: true,
    });
  }

  /** Recherche l'onglet actif ; l'onglet inactif attend sa première activation. */
  #runActive(force = false): void {
    if (!this.#isBrowser) {
      return;
    }
    const tab = this.activeTab();
    const query: SearchQuery = {
      q: this.q(),
      subjectId: this.subjectId(),
      educationLevelId: this.levelId(),
      page: this.page(),
    };
    const key = JSON.stringify(query);
    if (!force && this.#lastRun[tab] === key) {
      return;
    }
    this.#lastRun[tab] = key;
    if (tab === 'courses') {
      this.#search.searchCourses(query);
    } else {
      this.#search.searchTeachers(query);
    }
  }
}
