import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, concatMap, debounceTime, EMPTY, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Famille du corps du rendu : sans empattement (défaut) ou à empattement. */
export type CourseFontChoice = 'sans' | 'serif';

/**
 * Réglages de style du rendu markdown d'un cours. Propriété du cours (et non
 * préférence globale du lecteur) : sera persistée côté back dans une colonne
 * JSONB, branchée juste après ce premier développement.
 */
export interface CourseStyleSettings {
  /** Taille de police du corps, en px (appliquée comme facteur px/16). */
  fontSizePx: number;
  /** Facteur d'échelle des titres (1 = tailles historiques). */
  headingScale: number;
  /** Interligne du corps (appliqué comme facteur valeur/1.7). */
  lineHeight: number;
  /** Largeur de la colonne de lecture, en ch (écran uniquement). */
  widthCh: number;
  /** Espacement sous les paragraphes, en em (appliqué comme facteur valeur/1.5). */
  paragraphGapEm: number;
  /** Famille du corps. */
  font: CourseFontChoice;
}

/** Défauts = valeurs historiques du rendu (aucune personnalisation active). */
export const COURSE_STYLE_DEFAULTS: CourseStyleSettings = {
  fontSizePx: 16,
  headingScale: 1,
  lineHeight: 1.7,
  widthCh: 68,
  paragraphGapEm: 1.5,
  font: 'sans',
};

/** Bornes de chaque réglage (sliders de la modale + validation du JSONB futur). */
export const COURSE_STYLE_BOUNDS = {
  fontSizePx: { min: 14, max: 22, step: 1 },
  headingScale: { min: 0.85, max: 1.3, step: 0.05 },
  lineHeight: { min: 1.4, max: 2.2, step: 0.05 },
  widthCh: { min: 54, max: 92, step: 2 },
  paragraphGapEm: { min: 0.8, max: 2.4, step: 0.1 },
} as const;

/** Borne un nombre dans [min, max] ; `fallback` si non fini. */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

/**
 * Normalise/borne des réglages potentiellement partiels ou invalides (saisie de
 * la modale, future désérialisation du JSONB). Chaque champ retombe sur son
 * défaut s'il est absent ou hors-bornes. Pur — testable isolément.
 */
export function clampCourseStyle(
  raw: Partial<CourseStyleSettings> | null | undefined,
): CourseStyleSettings {
  const r = raw ?? {};
  return {
    fontSizePx: clampNumber(
      r.fontSizePx,
      COURSE_STYLE_BOUNDS.fontSizePx.min,
      COURSE_STYLE_BOUNDS.fontSizePx.max,
      COURSE_STYLE_DEFAULTS.fontSizePx,
    ),
    headingScale: clampNumber(
      r.headingScale,
      COURSE_STYLE_BOUNDS.headingScale.min,
      COURSE_STYLE_BOUNDS.headingScale.max,
      COURSE_STYLE_DEFAULTS.headingScale,
    ),
    lineHeight: clampNumber(
      r.lineHeight,
      COURSE_STYLE_BOUNDS.lineHeight.min,
      COURSE_STYLE_BOUNDS.lineHeight.max,
      COURSE_STYLE_DEFAULTS.lineHeight,
    ),
    widthCh: clampNumber(
      r.widthCh,
      COURSE_STYLE_BOUNDS.widthCh.min,
      COURSE_STYLE_BOUNDS.widthCh.max,
      COURSE_STYLE_DEFAULTS.widthCh,
    ),
    paragraphGapEm: clampNumber(
      r.paragraphGapEm,
      COURSE_STYLE_BOUNDS.paragraphGapEm.min,
      COURSE_STYLE_BOUNDS.paragraphGapEm.max,
      COURSE_STYLE_DEFAULTS.paragraphGapEm,
    ),
    font: r.font === 'serif' ? 'serif' : 'sans',
  };
}

/**
 * Custom properties CSS dérivées des réglages, à poser en `[style]` inline sur
 * le conteneur de rendu du cours (`.course-content` / `#previewContent`). Les
 * dimensions dont le défaut diverge écran/papier sont exprimées en FACTEURS
 * (cf. _tokens.scss et _print.scss) : chaque média garde sa base × le facteur.
 * Pur — testable isolément.
 */
export function courseStyleVars(s: CourseStyleSettings): Record<string, string> {
  return {
    '--course-font-scale': String(s.fontSizePx / 16),
    '--course-heading-scale': String(s.headingScale),
    '--course-line-scale': String(s.lineHeight / 1.7),
    '--course-para-scale': String(s.paragraphGapEm / 1.5),
    '--course-width': `${s.widthCh}ch`,
    '--course-font': s.font === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)',
  };
}

/** Débounce d'écriture (le panneau est branché sur des sliders — cf. contrat back). */
const SAVE_DEBOUNCE_MS = 600;

/**
 * Porte les réglages de style du **cours courant** (source de vérité en signal),
 * en dérive les custom properties à appliquer au rendu, et les **persiste** via
 * l'API (`PUT /courses/{id}/preview`, remplacement total des 6 champs, débouncé).
 * Les réglages sont **chargés par cours** depuis `course.preview_settings`
 * (renvoyé dans le détail) : `load(courseId, initial)` applique l'objet
 * enregistré, ou les défauts s'il est absent/`{}` (via `clampCourseStyle`).
 *
 * `HttpClient` est injecté **optionnel** : la persistance ne doit pas forcer tous
 * les hôtes du `MarkdownView` partagé à fournir HttpClient en test ; sans lui
 * (specs, SSR) le service reste pleinement fonctionnel, seule l'écriture est
 * inactive. N'écrit **jamais** sur `:root` : les composants bindent `styleVars()`
 * en `[style]` sur leur conteneur (scope par cours, et l'inline voyage avec le
 * clone d'impression → le PDF suit sans code dédié).
 */
@Injectable({ providedIn: 'root' })
export class CourseStyleService {
  readonly #http = inject(HttpClient, { optional: true });
  readonly #coursesUrl = `${environment.apiUrl}/v1/courses`;

  /** Cours dont les réglages sont chargés (garde l'idempotence de `load`). */
  #courseId: string | null = null;

  readonly #settings = signal<CourseStyleSettings>(COURSE_STYLE_DEFAULTS);
  /** Réglages de style du cours courant. */
  readonly settings = this.#settings.asReadonly();

  /** Custom properties à binder en `[style]` sur le conteneur de rendu. */
  readonly styleVars = computed(() => courseStyleVars(this.#settings()));

  /** Émet à chaque édition ; débouncé puis persisté (remplacement total). */
  readonly #persist = new Subject<void>();

  constructor() {
    // Écriture débouncée. concatMap (comme l'autosave du block-editor) sérialise
    // les PUT dans l'ordre ; le corps est relu à l'ENVOI (état courant, 6 champs
    // stricts). catchError garde le flux vivant sur erreur → retente à l'édition
    // suivante. Inactif sans HttpClient (test/SSR) ou hors contexte cours.
    this.#persist
      .pipe(
        debounceTime(SAVE_DEBOUNCE_MS),
        concatMap(() => {
          const courseId = this.#courseId;
          if (this.#http === null || courseId === null) {
            return EMPTY;
          }
          return this.#http
            .put<CourseStyleSettings>(`${this.#coursesUrl}/${courseId}/preview`, this.#settings())
            .pipe(catchError(() => EMPTY));
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /**
   * Prépare les réglages pour un cours (appelé quand son détail arrive).
   * Idempotent sur le même cours : garde l'état courant (édition en vol) tant
   * qu'on y reste. `initial` = `course.preview_settings` (objet enregistré, ou
   * absent/`{}` → défauts).
   */
  load(courseId: string, initial?: Partial<CourseStyleSettings>): void {
    if (this.#courseId === courseId) {
      return;
    }
    this.#courseId = courseId;
    this.#settings.set(clampCourseStyle(initial));
  }

  /** Applique un changement partiel (borné), reflété en direct puis persisté. */
  update(patch: Partial<CourseStyleSettings>): void {
    this.#settings.set(clampCourseStyle({ ...this.#settings(), ...patch }));
    this.#persist.next();
  }

  /** Réinitialise le cours courant aux valeurs par défaut (et persiste). */
  reset(): void {
    this.#settings.set(COURSE_STYLE_DEFAULTS);
    this.#persist.next();
  }
}
