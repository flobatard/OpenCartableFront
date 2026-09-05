import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { exerciseViewFromContent } from '../../core/courses/exercise-form';
import { LanguageService } from '../../core/i18n/language.service';
import { isBlockId } from '../../core/markdown/course-block-ref';
import {
  answerStorage,
  answerStorageKey,
  clearAnswers,
  readAnswers,
  StoredAnswer,
  writeAnswers,
} from '../../core/student/answer-storage';
import {
  CorrectionRequest,
  QuestionThread,
  SubmissionTurn,
  ThreadsClearRequest,
} from '../../core/student/exercise-correction';
import { MarkdownView } from '../markdown-view/markdown-view';
import { Spinner } from '../spinner/spinner';
import { armedAction } from '../../core/editing/armed';

/** Rendu d'un bloc exercice : aperçu en lecture seule, ou résolution par l'élève. */
export type ExerciseViewMode = 'preview' | 'solve';

/** Délai d'autosave localStorage après une frappe (ms). */
export const ANSWER_SAVE_DEBOUNCE_MS = 500;

/**
 * Rendu partagé d'un bloc `exercise` — sujet puis questions **une à une**, en
 * cartes numérotées « Question n » — à deux modes :
 *
 * - **`preview`** (défaut — Aperçu prof, « Cours entier » et son PDF) : sujet
 *   et énoncés seuls, aucune zone de réponse, localStorage jamais touché ;
 * - **`solve`** (le bloc seul de la vue élève, `blocks/:blockId`) : une zone de
 *   réponse par question, « Marquer comme terminé » (verrouille la zone),
 *   « Effacer mes réponses » en deux temps désarmé au blur, réponses en
 *   **localStorage** (`core/student/answer-storage`, clé `(courseId, blockId)`,
 *   une entrée par id de question) : autosave débouncé après la frappe, flush
 *   au destroy **et au changement de clé** — la vue est robuste à un
 *   changement d'inputs, même si `CourseBlocksView` la recrée par
 *   `track block.id`. Storage indisponible → notice, la saisie reste possible
 *   mais non persistée.
 *
 * **Tuteur IA — fil par question** (mode `solve`, élève connecté) : sous
 * `correctionEnabled`, « Demander une correction » émet `correctionRequested`
 * avec la réponse courante (`kind: 'answer'`) ; le fil (`threads`, une entrée
 * par id de question, tenu par l'hôte) rend les tours — bulle de l'élève,
 * retour du tuteur en markdown, badge de verdict —, le tour en cours (spinner
 * puis texte streamé), l'erreur par statut, l'encart « Réponse attendue »
 * quand le corrigé a été révélé, et un composer « Répondre / demander de
 * l'aide » (`kind: 'message'`), et l'élève peut **effacer** ses échanges —
 * un fil (« Effacer ce fil ») ou tous ceux du bloc (pied de carte), en deux
 * temps désarmés au blur (`threadsClearRequested`). Sans session
 * (`correctionLoginHint`), une notice invite à se connecter (`loginRequested`). Les citations
 * `oc-block:` des retours naviguent vers `blockLink(id)` quand l'hôte le
 * fournit (re-garde `isBlockId`).
 *
 * Présentational : aucun service métier injecté (invariant vue élève —
 * `courseId`/`blockId` viennent des inputs, les `oc-resource:` des énoncés
 * passent par le résolveur de la route via `app-markdown-view`). Le corrigé
 * (`expected_answer`) n'est jamais lu (`exerciseViewFromContent`) — et côté
 * routes publiques, le back ne le sert même pas. Les markdown-views internes
 * n'affichent ni bouton d'impression ni réglages : le PDF du cours entier et
 * le style de lecture (variables posées en `[style]`) sont portés par l'hôte.
 * Client-only (markdown-view).
 */
@Component({
  selector: 'app-exercise-view',
  imports: [TranslocoPipe, RouterLink, MarkdownView, Spinner],
  templateUrl: './exercise-view.html',
  styleUrl: './exercise-view.scss',
})
export class ExerciseView implements OnDestroy {
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #router = inject(Router);
  protected readonly language = inject(LanguageService);

  /** `content` JSONB du bloc exercice (forme tolérée, cf. `exerciseViewFromContent`). */
  readonly content = input.required<Record<string, unknown>>();
  /** Cours du bloc : résolution des `oc-resource:` et clé des réponses. */
  readonly courseId = input.required<string>();
  /** Bloc rendu : clé des réponses persistées. */
  readonly blockId = input.required<string>();
  readonly mode = input<ExerciseViewMode>('preview');
  /** Active le tuteur IA (élève connecté) : bouton de correction et composer. */
  readonly correctionEnabled = input(false);
  /** Sans session : notice « connectez-vous » à la place du tuteur. */
  readonly correctionLoginHint = input(false);
  /** Fils du tuteur par id de question ; aucune entrée = rien de rendu. */
  readonly threads = input<Readonly<Record<string, QuestionThread>>>({});
  /** Commandes de navigation vers un bloc cité (`oc-block:`), ou `null`. */
  readonly blockLink = input<((blockId: string) => string[]) | null>(null);
  readonly correctionRequested = output<CorrectionRequest>();
  readonly threadsClearRequested = output<ThreadsClearRequest>();
  readonly loginRequested = output<void>();

  protected readonly view = computed(() => exerciseViewFromContent(this.content()));
  protected readonly solving = computed(() => this.mode() === 'solve');

  /** Réponses par id de question — source de vérité de l'écran (mode solve). */
  protected readonly answers = signal<Record<string, StoredAnswer>>({});
  /** Persistance indisponible (navigation privée stricte, quota) : notice. */
  protected readonly storageOk = signal(true);
  /** « Effacer mes réponses » armé (deux temps, désarmé au blur). */
  protected readonly clearArmed = armedAction();
  /** Vrai dès qu'au moins une réponse est enregistrée sur l'appareil. */
  protected readonly hasAnswers = computed(() =>
    Object.values(this.answers()).some((a) => a.text !== '' || a.locked),
  );
  /** Brouillons du composer « Répondre » par id de question (non persistés). */
  protected readonly replies = signal<Record<string, string>>({});
  /** Effacement de fil armé : id de question, `'*'` pour tout le bloc, sinon `null`. */
  protected readonly clearThreadArmed = armedAction<string>();
  /** Au moins un fil persisté sur le bloc (bouton d'effacement global). */
  protected readonly hasThreads = computed(() =>
    Object.values(this.threads()).some((t) => t.turns.length > 0),
  );

  /** localStorage, résolu paresseusement au premier besoin (mode solve, navigateur). */
  #storage: Storage | null | undefined;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Clé des réponses affichées ; `null` tant qu'aucune restauration n'a eu lieu. */
  #restoredKey: string | null = null;

  constructor() {
    // Restaure les réponses persistées dès que la clé (cours, bloc) est
    // connue, une fois par clé — en flushant d'abord la frappe en attente de
    // la précédente. Ne dépend que du mode et de la clé : jamais d'`answers()`
    // ici (sinon re-run à chaque frappe).
    effect(() => {
      if (this.mode() !== 'solve') {
        return;
      }
      const key = answerStorageKey(this.courseId(), this.blockId());
      if (this.#restoredKey === key) {
        return;
      }
      untracked(() => {
        this.#flush();
        this.#restoredKey = key;
        const storage = this.#resolveStorage();
        this.answers.set(readAnswers(storage, key).answers);
        this.storageOk.set(storage !== null);
        this.clearArmed.disarm();
        this.replies.set({});
        this.clearThreadArmed.disarm();
      });
    });
  }

  ngOnDestroy(): void {
    // Flush : une frappe dont le debounce n'a pas expiré part quand même.
    this.#flush();
  }

  /** Réponse courante d'une question (chaîne vide si jamais saisie). */
  protected answerText(questionId: string): string {
    return this.answers()[questionId]?.text ?? '';
  }

  /** Question marquée « terminée » (zone de réponse verrouillée). */
  protected isLocked(questionId: string): boolean {
    return this.answers()[questionId]?.locked === true;
  }

  /** Fil du tuteur sur la question, ou `undefined` (jamais sollicité). */
  protected threadFor(questionId: string): QuestionThread | undefined {
    return this.threads()[questionId];
  }

  /** Un tour est en cours sur la question (composer et bouton désactivés). */
  protected turnActive(questionId: string): boolean {
    return this.threadFor(questionId)?.live !== null && this.threadFor(questionId) !== undefined;
  }

  /** Bouton « Demander une correction » : activé, réponse saisie, rien en cours. */
  protected canRequestCorrection(questionId: string): boolean {
    return (
      this.solving() &&
      this.correctionEnabled() &&
      this.answerText(questionId).trim() !== '' &&
      !this.turnActive(questionId)
    );
  }

  protected requestCorrection(questionId: string): void {
    this.correctionRequested.emit({
      blockId: this.blockId(),
      questionId,
      kind: 'answer',
      content: this.answerText(questionId),
    });
  }

  protected replyText(questionId: string): string {
    return this.replies()[questionId] ?? '';
  }

  protected onReplyInput(questionId: string, value: string): void {
    this.replies.update((replies) => ({ ...replies, [questionId]: value }));
  }

  protected canSendReply(questionId: string): boolean {
    return this.replyText(questionId).trim() !== '' && !this.turnActive(questionId);
  }

  /** Composer du fil : message libre au tuteur (aide, question sur le cours). */
  protected sendReply(questionId: string): void {
    const content = this.replyText(questionId).trim();
    if (content === '' || this.turnActive(questionId)) {
      return;
    }
    this.replies.update((replies) => ({ ...replies, [questionId]: '' }));
    this.correctionRequested.emit({
      blockId: this.blockId(),
      questionId,
      kind: 'message',
      content,
    });
  }

  /** Ctrl/⌘+Entrée envoie le message du composer. */
  protected onReplyKeydown(event: KeyboardEvent, questionId: string): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.sendReply(questionId);
    }
  }

  /** Bouton d'effacement d'un fil : visible si des tours existent, hors tour en cours. */
  protected canClearThread(questionId: string): boolean {
    const thread = this.threadFor(questionId);
    return (
      this.correctionEnabled() &&
      thread !== undefined &&
      thread.turns.length > 0 &&
      !this.turnActive(questionId)
    );
  }

  /** Efface un fil (`questionId`) ou tous (`'*'`) — deux temps : arme, puis confirme. */
  protected clearThreads(target: string): void {
    if (!this.clearThreadArmed.confirm(target)) {
      return;
    }
    this.threadsClearRequested.emit({
      blockId: this.blockId(),
      questionId: target === '*' ? null : target,
    });
  }

  /** Clé i18n du badge de verdict d'un tour (`null` sans verdict évaluable). */
  protected verdictKey(turn: SubmissionTurn): string | null {
    if (turn.verdict === null || turn.verdict === 'none') {
      return null;
    }
    return `student.exercise.correction.verdict.${turn.verdict}`;
  }

  /** Clé i18n du message d'erreur du fil, par statut (motif course-chat). */
  protected errorKey(status: number): string {
    if (status === 429) {
      return 'student.exercise.correction.quotaError';
    }
    if (status === 400 || status === 422) {
      return 'student.exercise.correction.configError';
    }
    return 'student.exercise.correction.error';
  }

  /** Erreur qui renvoie vers les réglages IA (config absente, clé refusée, quota). */
  protected errorNeedsSettings(status: number): boolean {
    return status === 429 || status === 400 || status === 422;
  }

  /**
   * Délégation des citations `oc-block:` des retours du tuteur — clic ou
   * Entrée sur l'ancre `[data-oc-block-id]` (re-garde `isBlockId` : l'attribut
   * peut venir de HTML brut) → navigation vers le bloc cité, si l'hôte fournit
   * `blockLink`.
   */
  protected onCitation(event: Event): void {
    const build = this.blockLink();
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest<HTMLElement>('[data-oc-block-id]');
    const blockId = anchor?.getAttribute('data-oc-block-id');
    if (build === null || !blockId || !isBlockId(blockId)) {
      return;
    }
    event.preventDefault();
    void this.#router.navigate(build(blockId));
  }

  protected onCitationKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onCitation(event);
    }
  }

  /** Frappe dans la zone de réponse : état en mémoire + autosave débouncé. */
  protected onAnswerInput(questionId: string, value: string): void {
    this.answers.update((answers) => ({
      ...answers,
      [questionId]: {
        text: value,
        locked: answers[questionId]?.locked === true,
        updatedAt: new Date().toISOString(),
      },
    }));
    this.#scheduleSave();
  }

  /** Bascule « Marquer comme terminé » / « Modifier » (persistée immédiatement). */
  protected toggleLocked(questionId: string): void {
    this.answers.update((answers) => ({
      ...answers,
      [questionId]: {
        text: answers[questionId]?.text ?? '',
        locked: answers[questionId]?.locked !== true,
        updatedAt: new Date().toISOString(),
      },
    }));
    this.#cancelScheduledSave();
    this.#persist();
  }

  /** Efface tout (deux temps : premier clic arme, second confirme). */
  protected clearAll(): void {
    if (!this.clearArmed.confirm(true)) {
      return;
    }
    this.#cancelScheduledSave();
    this.answers.set({});
    if (this.#restoredKey !== null) {
      clearAnswers(this.#resolveStorage(), this.#restoredKey);
    }
  }

  #resolveStorage(): Storage | null {
    if (this.#storage === undefined) {
      this.#storage = this.#isBrowser ? answerStorage() : null;
    }
    return this.#storage;
  }

  #scheduleSave(): void {
    if (!this.#isBrowser) {
      return;
    }
    this.#cancelScheduledSave();
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      this.#persist();
    }, ANSWER_SAVE_DEBOUNCE_MS);
  }

  #cancelScheduledSave(): void {
    if (this.#saveTimer !== null) {
      clearTimeout(this.#saveTimer);
      this.#saveTimer = null;
    }
  }

  /** Persiste tout de suite une sauvegarde en attente (destroy, changement de clé). */
  #flush(): void {
    if (this.#saveTimer !== null) {
      this.#cancelScheduledSave();
      this.#persist();
    }
  }

  /** Écrit les réponses courantes sous la clé restaurée. */
  #persist(): void {
    if (this.#restoredKey === null) {
      return;
    }
    const ok = writeAnswers(this.#resolveStorage(), this.#restoredKey, {
      version: 2,
      answers: this.answers(),
    });
    this.storageOk.set(ok);
  }
}
