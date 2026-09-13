import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  AssistantPendingQuestions,
  QuestionAnswer,
} from '../../../core/course-assistant/questions';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { CourseChatQuestions } from './course-chat-questions';

const LEVEL = {
  text: 'Quel niveau visez-vous ?',
  multiSelect: false,
  options: [
    { label: 'Seconde', description: null },
    { label: 'Première', description: 'Spécialité maths' },
  ],
};

const NOTIONS = {
  text: 'Quelles notions inclure ?',
  multiSelect: true,
  options: [
    { label: 'Dérivée', description: null },
    { label: 'Limites', description: null },
    { label: 'Suites', description: null },
  ],
};

function pending(questions = [LEVEL, NOTIONS], id = 'call_q'): AssistantPendingQuestions {
  return { id, questions, reoffered: false };
}

describe('CourseChatQuestions', () => {
  let fixture: ComponentFixture<CourseChatQuestions>;
  let answered: QuestionAnswer[][];
  let declined: number;

  async function create(value = pending()): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [CourseChatQuestions, provideTranslocoTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(CourseChatQuestions);
    fixture.componentRef.setInput('pending', value);
    answered = [];
    declined = 0;
    fixture.componentInstance.answered.subscribe((answers) => answered.push(answers));
    fixture.componentInstance.declined.subscribe(() => (declined += 1));
    await fixture.whenStable();
  }

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (selector: string) => host().querySelector(selector)?.textContent?.trim() ?? '';
  const primary = () => host().querySelector<HTMLButtonElement>('.btn--primary')!;
  const ghost = () => host().querySelector<HTMLButtonElement>('.btn--ghost');
  /** Cases et boutons radio des cartes de choix (« Autre » en dernier). */
  const choices = () =>
    Array.from(
      host().querySelectorAll<HTMLInputElement>(
        '.chat-questions__choice input:not(.chat-questions__other-input)',
      ),
    );
  const otherInput = () => host().querySelector<HTMLInputElement>('.chat-questions__other-input')!;

  async function click(element: HTMLElement): Promise<void> {
    element.click();
    await fixture.whenStable();
  }

  async function type(value: string): Promise<void> {
    otherInput().value = value;
    otherInput().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('a single question has no step chrome, only « Répondre »', async () => {
    await create(pending([LEVEL]));
    expect(text('.chat-questions__title')).toBe("Question de l'assistant");
    expect(host().querySelector('.chat-questions__step')).toBeNull();
    expect(ghost()).toBeNull();
    expect(primary().textContent?.trim()).toBe('Répondre');
    expect(primary().disabled).toBe(true);
  });

  it('renders radio choice cards with their description, plus « Autre »', async () => {
    await create(pending([LEVEL]));
    expect(text('.chat-questions__question')).toBe('Quel niveau visez-vous ?');
    const inputs = choices();
    expect(inputs.map((input) => input.type)).toEqual(['radio', 'radio', 'radio']);
    expect(new Set(inputs.map((input) => input.name)).size).toBe(1);
    expect(text('.chat-questions__choice-hint')).toBe('Spécialité maths');
    expect(text('.chat-questions__choice--other .chat-questions__choice-label')).toBe('Autre');
    expect(host().querySelector('.chat-questions__hint')).toBeNull();
  });

  it('steps through the questions, Suivant disabled until the current one is answered', async () => {
    await create();
    expect(text('.chat-questions__step')).toBe('Question 1 sur 2');
    expect(primary().textContent?.trim()).toBe('Suivant');
    expect(primary().disabled).toBe(true);
    expect(ghost()!.disabled).toBe(true);

    await click(choices()[1]);
    expect(primary().disabled).toBe(false);
    await click(primary());

    expect(text('.chat-questions__step')).toBe('Question 2 sur 2');
    expect(text('.chat-questions__question')).toBe('Quelles notions inclure ?');
    expect(text('.chat-questions__hint')).toBe('Plusieurs réponses possibles');
    expect(choices().map((input) => input.type)).toEqual([
      'checkbox',
      'checkbox',
      'checkbox',
      'checkbox',
    ]);
    expect(primary().textContent?.trim()).toBe('Répondre');
    expect(primary().disabled).toBe(true);

    // Précédent : la réponse de la première question est conservée.
    await click(ghost()!);
    expect(text('.chat-questions__step')).toBe('Question 1 sur 2');
    expect(choices()[1].checked).toBe(true);
    expect(primary().disabled).toBe(false);
  });

  it('typing in « Autre » checks it and answers the question', async () => {
    await create(pending([LEVEL]));
    await click(choices()[0]);
    await type('Terminale');
    const inputs = choices();
    expect(inputs[2].checked).toBe(true);
    expect(inputs[0].checked).toBe(false);
    expect(primary().disabled).toBe(false);

    await click(primary());
    expect(answered).toEqual([[{ selected: [], other: 'Terminale' }]]);
  });

  it('a checked « Autre » left blank is not an answer', async () => {
    await create(pending([NOTIONS]));
    await click(choices()[0]);
    expect(primary().disabled).toBe(false);
    await click(choices()[3]); // « Autre » coché, sans texte
    expect(primary().disabled).toBe(true);
    await type('Tangentes');
    expect(primary().disabled).toBe(false);
  });

  it('collects every answer — indices in option order and the « Autre » text', async () => {
    await create();
    await click(choices()[0]);
    await click(primary());
    await click(choices()[2]);
    await click(choices()[0]);
    await type(' Tangentes ');
    await click(primary());

    expect(answered).toEqual([
      [
        { selected: [0], other: null },
        { selected: [0, 2], other: 'Tangentes' },
      ],
    ]);
  });

  it('submitting the form (Entrée in « Autre ») advances only when answered', async () => {
    await create();
    const form = host().querySelector('form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect(text('.chat-questions__step')).toBe('Question 1 sur 2');

    await type('Terminale');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect(text('.chat-questions__step')).toBe('Question 2 sur 2');
    expect(answered).toEqual([]);
  });

  it('the cross declines the whole series', async () => {
    await create();
    const cross = host().querySelector<HTMLButtonElement>('.chat-questions__decline')!;
    expect(cross.getAttribute('aria-label')).toBe('Ne pas répondre');
    await click(cross);
    expect(declined).toBe(1);
    expect(answered).toEqual([]);
  });

  it('busy disables the choices and every action', async () => {
    await create(pending([LEVEL]));
    await click(choices()[0]);
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    expect(host().querySelector<HTMLFieldSetElement>('fieldset')!.disabled).toBe(true);
    expect(primary().disabled).toBe(true);
    expect(host().querySelector<HTMLButtonElement>('.chat-questions__decline')!.disabled).toBe(
      true,
    );
  });

  it('a new series starts over, a retry of the same series keeps the drafts', async () => {
    await create();
    await click(choices()[1]);
    await click(primary());

    // Même série (nouvel objet, même id) : étape et brouillons conservés.
    fixture.componentRef.setInput('pending', pending());
    await fixture.whenStable();
    expect(text('.chat-questions__step')).toBe('Question 2 sur 2');

    fixture.componentRef.setInput('pending', pending([LEVEL, NOTIONS], 'call_next'));
    await fixture.whenStable();
    expect(text('.chat-questions__step')).toBe('Question 1 sur 2');
    expect(choices().some((input) => input.checked)).toBe(false);
  });
});
