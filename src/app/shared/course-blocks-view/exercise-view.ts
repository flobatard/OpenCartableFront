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
import { armedAction } from '../../core/editing/armed';
import { LanguageService } from '../../core/i18n/language.service';
import { AnswerDraft } from '../../core/student/answer-draft';
import { answerStorageKey } from '../../core/student/answer-storage';
import {
  CorrectionRequest,
  QuestionThread,
  SubmissionTurn,
  ThreadsClearRequest,
} from '../../core/student/exercise-correction';
import { BlockCitations } from '../block-citations/block-citations.directive';
import { MarkdownView } from '../markdown-view/markdown-view';
import { Spinner } from '../spinner/spinner';

export { ANSWER_SAVE_DEBOUNCE_MS } from '../../core/student/answer-draft';

/** Rendu d'un bloc exercice : aperçu en lecture seule, ou résolution par l'élève. */
export type ExerciseViewMode = 'preview' | 'solve';

/**
 * Rendu partagé d'un bloc `exercise` — sujet puis questions **une à une**, en
 * cartes numérotées « Question n » — à deux modes :
 *
 * - **`preview`** (défaut — Aperçu prof, « Cours entier » et son PDF) : sujet
 *   et énoncés seuls, aucune zone de réponse, localStorage jamais touché ;
 * - **`solve`** (le bloc seul de la vue élève, `blocks/:blockId`) : une zone de
 *   réponse par question, « Marquer comme terminé » (verrouille la zone),
 *   « Effacer mes réponses » en deux temps désarmé au blur, réponses en
 *   **localStorage** (`AnswerDraft`, clé `(courseId, blockId)`, une entrée par
 *   id de question) : autosave débouncé après la frappe, flush au destroy
 *   **et au changement de clé** — la vue est robuste à un changement d'inputs,
 *   même si `CourseBlocksView` la recrée par `track block.id`. Storage
 *   indisponible → notice, la saisie reste possible mais non persistée.
 *
 * **Tuteur IA — fil par question** (mode `solve`, élève connecté) : sous
 * `correctionEnabled`, « Demander une correction » émet `correctionRequested`
 * avec la réponse courante (`kind: 'answer'`) ; le fil (`threads`, une entrée
 * par id de question, tenu par l'hôte) rend les tours — bulle de l'élève,
 * retour du tuteur en markdown, badge de verdict —, le tour en cours (spinner
 * puis texte streamé), l'erreur par statut, l'encart « Réponse attendue »
 * quand le corrigé a été révélé, et un composer « Répondre / demander de
 * l'aide » (`kind: 'message'`) ; l'élève peut **effacer** ses échanges — un
 * fil ou tous ceux du bloc — en deux temps désarmés au blur
 * (`threadsClearRequested`). Sans session (`correctionLoginHint`), une notice
 * invite à se connecter (`loginRequested`). Les citations `oc-block:` des
 * retours naviguent vers `blockLink(id)` quand l'hôte le fournit (directive
 * `ocBlockCitations`).
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
  imports: [BlockCitations, TranslocoPipe, RouterLink, MarkdownView, Spinner],
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

  /** Réponses de l'élève (mode solve) : état + persistance localStorage. */
  readonly #draft = new AnswerDraft(this.#isBrowser);
  protected readonly answers = this.#draft.answers;
  protected readonly storageOk = this.#draft.storageOk;
  protected readonly hasAnswers = this.#draft.hasAnswers;
  /** « Effacer mes réponses » armé (deux temps, désarmé au blur). */
  protected readonly clearArmed = armedAction();
  /** Brouillons du composer « Répondre » par id de question (non persistés). */
  protected readonly replies = signal<Record<string, string>>({});
  /** Effacement de fil armé : id de question, `'*'` pour tout le bloc, sinon `null`. */
  protected readonly clearThreadArmed = armedAction<string>();
  /** Au moins un fil persisté sur le bloc (bouton d'effacement global). */
  protected readonly hasThreads = computed(() =>
    Object.values(this.threads()).some((t) => t.turns.length > 0),
  );

  constructor() {
    // Restaure les réponses persistées dès que la clé (cours, bloc) est
    // connue, une fois par clé. Ne dépend que du mode et de la clé : jamais
    // d'`answers()` ici (sinon re-run à chaque frappe).
    effect(() => {
      if (this.mode() !== 'solve') {
        return;
      }
      const key = answerStorageKey(this.courseId(), this.blockId());
      if (this.#draft.key === key) {
        return;
      }
      untracked(() => {
        this.#draft.restore(key);
        this.clearArmed.disarm();
        this.replies.set({});
        this.clearThreadArmed.disarm();
      });
    });
  }

  ngOnDestroy(): void {
    // Flush : une frappe dont le debounce n'a pas expiré part quand même.
    this.#draft.flush();
  }

  /** Réponse courante d'une question (chaîne vide si jamais saisie). */
  protected answerText(questionId: string): string {
    return this.#draft.text(questionId);
  }

  /** Question marquée « terminée » (zone de réponse verrouillée). */
  protected isLocked(questionId: string): boolean {
    return this.#draft.isLocked(questionId);
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

  /** Clé i18n du message d'erreur du fil, par statut. */
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

  /** Citation `oc-block:` d'un retour du tuteur (directive `ocBlockCitations`) :
      navigation vers le bloc cité, si l'hôte fournit `blockLink`. */
  protected onCitation(blockId: string): void {
    const build = this.blockLink();
    if (build !== null) {
      void this.#router.navigate(build(blockId));
    }
  }

  /** Frappe dans la zone de réponse : état en mémoire + autosave débouncé. */
  protected onAnswerInput(questionId: string, value: string): void {
    this.#draft.setText(questionId, value);
  }

  /** Bascule « Marquer comme terminé » / « Modifier » (persistée immédiatement). */
  protected toggleLocked(questionId: string): void {
    this.#draft.toggleLocked(questionId);
  }

  /** Efface tout (deux temps : premier clic arme, second confirme). */
  protected clearAll(): void {
    if (!this.clearArmed.confirm(true)) {
      return;
    }
    this.#draft.clear();
  }
}
