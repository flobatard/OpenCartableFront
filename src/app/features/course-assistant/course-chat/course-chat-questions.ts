import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  AssistantPendingQuestions,
  AssistantQuestion,
  draftAnswer,
  emptyDraft,
  isDraftAnswered,
  MAX_QUESTION_OTHER_CHARS,
  QuestionAnswer,
  QuestionDraft,
  selectOption,
  setOtherChecked,
  typeOther,
} from '../../../core/course-assistant/questions';

let sequence = 0;

/**
 * Questions de l'assistant au professeur, affichées À LA PLACE du composer du
 * chat tant que le run attend (`AssistantChatState.pendingQuestions`) — une
 * question par étape (« Question n sur N », Précédent / Suivant, « Répondre »
 * à la dernière ; aucune étape pour une question seule). Chaque question est
 * un groupe de cartes de choix — boutons radio (choix unique) ou cases à
 * cocher (choix multiple) — suivi d'un choix libre « Autre » dont la saisie
 * coche le choix. Toutes les questions sont obligatoires : Suivant / Répondre
 * restent inactifs sans réponse ; la croix de l'en-tête est le refus de
 * répondre (`declined`), qui vaut pour toute la série.
 *
 * Présentational : émet la réponse (`answered`, une par question, index des
 * suggestions) ou le refus ; `busy` (reprise en vol) neutralise tout. Étape et
 * brouillons sont liés à l'id de la série (`linkedSignal`) : une nouvelle série
 * repart de zéro, un envoi raté se réessaie sans ressaisie.
 */
@Component({
  selector: 'app-course-chat-questions',
  imports: [TranslocoPipe],
  templateUrl: './course-chat-questions.html',
  styleUrl: './course-chat-questions.scss',
})
export class CourseChatQuestions {
  readonly pending = input.required<AssistantPendingQuestions>();
  /** Reprise en cours d'envoi : formulaire neutralisé. */
  readonly busy = input(false);

  readonly answered = output<QuestionAnswer[]>();
  readonly declined = output<void>();

  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #uid = (sequence += 1);
  protected readonly titleId = `chat-questions-title-${this.#uid}`;
  protected readonly maxOtherChars = MAX_QUESTION_OTHER_CHARS;

  protected readonly step = linkedSignal<string, number>({
    source: () => this.pending().id,
    computation: (id, previous) => (previous && previous.source === id ? previous.value : 0),
  });

  readonly #drafts = linkedSignal<AssistantPendingQuestions, QuestionDraft[]>({
    source: this.pending,
    computation: (pending, previous) =>
      previous && previous.source.id === pending.id
        ? previous.value
        : pending.questions.map(() => emptyDraft()),
  });

  protected readonly total = computed(() => this.pending().questions.length);
  protected readonly question = computed<AssistantQuestion>(
    () => this.pending().questions[Math.min(this.step(), this.total() - 1)],
  );
  protected readonly draft = computed(() => this.#drafts()[this.step()] ?? emptyDraft());
  protected readonly isLast = computed(() => this.step() >= this.total() - 1);
  protected readonly answeredNow = computed(() => isDraftAnswered(this.draft()));
  /** Nom du groupe de choix, propre à la question affichée. */
  protected readonly fieldName = computed(() => `chat-questions-${this.#uid}-${this.step()}`);

  protected readonly questionText = viewChild<ElementRef<HTMLElement>>('questionText');
  protected readonly otherInput = viewChild<ElementRef<HTMLInputElement>>('otherInput');

  constructor() {
    // Le composer, désactivé pendant le flux, a perdu le focus : le rendre à
    // la question. Jamais volé ailleurs (éditeur, autre champ).
    afterNextRender(() => {
      const active = document.activeElement;
      if (active === null || active === document.body) {
        this.questionText()?.nativeElement.focus();
      }
    });
  }

  protected selectOption(index: number): void {
    this.#updateDraft((draft, question) => selectOption(draft, question, index));
  }

  protected onOtherToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.#updateDraft((draft, question) => setOtherChecked(draft, question, checked));
    if (checked) {
      this.otherInput()?.nativeElement.focus();
    }
  }

  protected onOtherInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.#updateDraft((draft, question) => typeOther(draft, question, text));
  }

  protected previous(): void {
    if (this.step() > 0) {
      this.step.update((step) => step - 1);
      this.#focusQuestion();
    }
  }

  /** Suivant, ou Répondre à la dernière étape — Entrée dans « Autre » compris. */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.busy() || !this.answeredNow()) {
      return;
    }
    if (this.isLast()) {
      this.answered.emit(this.#drafts().map(draftAnswer));
      return;
    }
    this.step.update((step) => step + 1);
    this.#focusQuestion();
  }

  protected decline(): void {
    if (!this.busy()) {
      this.declined.emit();
    }
  }

  #updateDraft(change: (draft: QuestionDraft, question: AssistantQuestion) => QuestionDraft): void {
    const step = this.step();
    const question = this.question();
    this.#drafts.update((drafts) =>
      drafts.map((draft, index) => (index === step ? change(draft, question) : draft)),
    );
  }

  /** Focus sur l'énoncé de la question affichée, une fois l'étape rendue. */
  #focusQuestion(): void {
    if (this.#isBrowser) {
      setTimeout(() => this.questionText()?.nativeElement.focus(), 0);
    }
  }
}
