import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExerciseEditor } from './exercise-editor';
import { ExerciseContentPayload } from '../../../core/courses/course.model';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';

/**
 * Composant présentationnel : `initial` posé avant le premier detectChanges,
 * `contentChange` observé par spy. Monaco est inerte en jsdom — les frappes
 * dans les énoncés passent par le formulaire public.
 */
describe('ExerciseEditor', () => {
  const CONTENT = {
    enonce: 'Résoudre les équations suivantes.',
    questions: [
      { id: 'q-1', enonce: 'Résoudre $x^2 = 4$.', type: 'texte_libre', reponse_attendue: 'x = ±2' },
      { id: 'q-2', enonce: 'Résoudre $x^3 = 8$.', type: 'texte_libre', reponse_attendue: 'x = 2' },
    ],
  };

  async function createComponent(
    initial: Record<string, unknown> = CONTENT,
  ): Promise<ComponentFixture<ExerciseEditor>> {
    await TestBed.configureTestingModule({
      imports: [ExerciseEditor, provideTranslocoTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExerciseEditor);
    fixture.componentRef.setInput('initial', initial);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: ComponentFixture<ExerciseEditor>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function emissions(fixture: ComponentFixture<ExerciseEditor>): ExerciseContentPayload[] {
    const seen: ExerciseContentPayload[] = [];
    fixture.componentInstance.contentChange.subscribe((p) => seen.push(p));
    return seen;
  }

  it('initialise le formulaire une seule fois depuis initial', async () => {
    const fixture = await createComponent();
    const form = fixture.componentInstance.form;

    expect(form.controls.enonce.value).toBe('Résoudre les équations suivantes.');
    expect(form.controls.questions.length).toBe(2);
    expect(form.controls.questions.at(0).getRawValue()).toEqual({
      id: 'q-1',
      enonce: 'Résoudre $x^2 = 4$.',
      reponseAttendue: 'x = ±2',
    });

    // Un changement de référence de l'input (patch du détail post-save) ne
    // re-patche pas : la frappe en cours serait écrasée.
    form.controls.enonce.setValue('Frappe en cours');
    fixture.componentRef.setInput('initial', { enonce: 'Écrasé côté serveur', questions: [] });
    fixture.detectChanges();

    expect(form.controls.enonce.value).toBe('Frappe en cours');
    expect(form.controls.questions.length).toBe(2);
  });

  it('émet le payload complet à chaque frappe', async () => {
    const fixture = await createComponent();
    const seen = emissions(fixture);

    fixture.componentInstance.form.controls.questions
      .at(0)
      .controls.reponseAttendue.setValue('x ∈ {−2, 2}');

    expect(seen.length).toBe(1);
    expect(seen[0]).toEqual({
      enonce: 'Résoudre les équations suivantes.',
      questions: [
        {
          id: 'q-1',
          enonce: 'Résoudre $x^2 = 4$.',
          type: 'texte_libre',
          reponse_attendue: 'x ∈ {−2, 2}',
        },
        { id: 'q-2', enonce: 'Résoudre $x^3 = 8$.', type: 'texte_libre', reponse_attendue: 'x = 2' },
      ],
    });
  });

  it('onglets Sujet/Questions : bascule par [hidden], panneaux jamais détruits', async () => {
    const fixture = await createComponent();
    const panels = el(fixture).querySelectorAll<HTMLElement>('.exercise-editor__panel');
    const tabs = el(fixture).querySelectorAll<HTMLButtonElement>('.exercise-editor__tabbar .tab');
    const [sujetPanel, questionsPanel] = Array.from(panels);
    const [sujetTab, questionsTab] = Array.from(tabs);

    // Sujet actif par défaut ; le compteur de questions est porté par l'onglet.
    expect(sujetPanel.hidden).toBe(false);
    expect(questionsPanel.hidden).toBe(true);
    expect(sujetTab.getAttribute('aria-selected')).toBe('true');
    expect(questionsTab.textContent).toContain('2');

    questionsTab.click();
    fixture.detectChanges();

    expect(sujetPanel.hidden).toBe(true);
    expect(questionsPanel.hidden).toBe(false);
    expect(questionsTab.getAttribute('aria-selected')).toBe('true');
    // Les panneaux restent montés ([hidden], jamais @if) : Monaco n'est pas rechargé.
    expect(sujetPanel.querySelector('app-markdown-field')).toBeTruthy();

    // Flèche gauche depuis le tablist : retour au sujet, focus déplacé (APG).
    questionsTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(sujetPanel.hidden).toBe(false);
    expect(sujetTab.getAttribute('aria-selected')).toBe('true');
  });

  it('état vide : message affiché, ajouter crée une question et émet', async () => {
    const fixture = await createComponent({ enonce: '', questions: [] });
    const seen = emissions(fixture);

    expect(el(fixture).querySelector('.exercise-editor__empty')).toBeTruthy();

    el(fixture).querySelector<HTMLButtonElement>('.exercise-editor__add')!.click();
    fixture.detectChanges();

    expect(el(fixture).querySelector('.exercise-editor__empty')).toBeNull();
    expect(el(fixture).querySelectorAll('.exercise-editor__question').length).toBe(1);
    expect(seen.length).toBe(1);
    expect(seen[0].questions).toEqual([
      { id: null, enonce: '', type: 'texte_libre', reponse_attendue: '' },
    ]);
  });

  it('supprime en deux temps, désarmé au blur', async () => {
    const fixture = await createComponent();
    const seen = emissions(fixture);
    const deleteBtn = (): HTMLButtonElement =>
      el(fixture).querySelector<HTMLButtonElement>('.exercise-editor__delete')!;

    deleteBtn().click(); // arme
    fixture.detectChanges();
    expect(deleteBtn().classList.contains('exercise-editor__delete--armed')).toBe(true);
    expect(seen.length).toBe(0); // rien supprimé, rien émis

    deleteBtn().dispatchEvent(new Event('blur')); // désarme
    fixture.detectChanges();
    expect(deleteBtn().classList.contains('exercise-editor__delete--armed')).toBe(false);

    deleteBtn().click(); // ré-arme
    deleteBtn().click(); // confirme
    fixture.detectChanges();

    expect(el(fixture).querySelectorAll('.exercise-editor__question').length).toBe(1);
    expect(seen.at(-1)!.questions.map((q) => q.id)).toEqual(['q-2']);
  });

  it('déplace une question (bornes désactivées) et émet le nouvel ordre', async () => {
    const fixture = await createComponent();
    const seen = emissions(fixture);
    const moveButtons = el(fixture).querySelectorAll<HTMLButtonElement>('.exercise-editor__move');

    // [monter q1, descendre q1, monter q2, descendre q2]
    expect(moveButtons[0].disabled).toBe(true); // q1 ne monte pas
    expect(moveButtons[3].disabled).toBe(true); // q2 ne descend pas

    moveButtons[1].click(); // descendre q1
    fixture.detectChanges();

    expect(seen.at(-1)!.questions.map((q) => q.id)).toEqual(['q-2', 'q-1']);
    const titles = el(fixture).querySelectorAll('.exercise-editor__question-title');
    expect(titles.length).toBe(2);
  });

  it('accordéon : une seule question dépliée, corps montés (Monaco préservé)', async () => {
    const fixture = await createComponent();
    const toggles = el(fixture).querySelectorAll<HTMLButtonElement>(
      '.exercise-editor__question-toggle',
    );
    const bodies = el(fixture).querySelectorAll<HTMLElement>('.exercise-editor__question-body');

    // Première question dépliée par défaut ; la seconde repliée.
    expect(toggles.length).toBe(2);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    expect(toggles[1].getAttribute('aria-expanded')).toBe('false');
    expect(bodies[0].hidden).toBe(false);
    expect(bodies[1].hidden).toBe(true);
    // Les deux énoncés restent montés ([hidden], jamais @if) : Monaco non détruit.
    expect(
      el(fixture).querySelectorAll('.exercise-editor__question-body app-markdown-field').length,
    ).toBe(2);

    // La question repliée montre un aperçu de son énoncé ; l'ouverte non.
    const previews = () =>
      el(fixture).querySelectorAll<HTMLElement>('.exercise-editor__question-preview');
    expect(previews().length).toBe(1);
    expect(previews()[0].textContent?.trim()).toBe('Résoudre $x^3 = 8$.');

    // Déplier la seconde replie la première (une seule ouverte à la fois).
    toggles[1].click();
    fixture.detectChanges();
    expect(bodies[0].hidden).toBe(true);
    expect(bodies[1].hidden).toBe(false);
    // L'aperçu suit : désormais sur la première (repliée).
    expect(previews()[0].textContent?.trim()).toBe('Résoudre $x^2 = 4$.');

    // Recliquer la question ouverte la replie (tout peut être fermé).
    toggles[1].click();
    fixture.detectChanges();
    expect(bodies[1].hidden).toBe(true);
  });

  it('ajouter déplie la nouvelle question', async () => {
    const fixture = await createComponent();

    el(fixture).querySelector<HTMLButtonElement>('.exercise-editor__add')!.click();
    fixture.detectChanges();

    const toggles = el(fixture).querySelectorAll<HTMLButtonElement>(
      '.exercise-editor__question-toggle',
    );
    expect(toggles.length).toBe(3);
    // Seule la dernière (nouvelle) est dépliée.
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
    expect(toggles[1].getAttribute('aria-expanded')).toBe('false');
    expect(toggles[2].getAttribute('aria-expanded')).toBe('true');
  });
});
