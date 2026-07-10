import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { ExerciseContentPayload, ExerciseQuestionPayload } from './course.model';

/**
 * Formulaire du contenu d'un bloc exercice : helpers purs sur le modèle de
 * `block-meta-form.ts`, consommés par l'éditeur d'exercice. Le formulaire
 * porte le sujet (markdown) et une `FormArray` de questions (énoncé markdown
 * + réponse attendue en texte simple + id back, `null` tant que le back n'en
 * a pas généré un).
 */

/** Longueurs miroir du back (`ExerciceContent`/`ExerciceQuestion`). */
const SUJET_MAX = 100_000;
const QUESTION_MAX = 20_000;
export const QUESTIONS_MAX = 50;

export type ExerciseQuestionGroup = FormGroup<{
  id: FormControl<string | null>;
  enonce: FormControl<string>;
  reponseAttendue: FormControl<string>;
}>;

export type ExerciseForm = FormGroup<{
  enonce: FormControl<string>;
  questions: FormArray<ExerciseQuestionGroup>;
}>;

export function buildQuestionGroup(
  question?: Partial<Pick<ExerciseQuestionPayload, 'id' | 'enonce' | 'reponse_attendue'>>,
): ExerciseQuestionGroup {
  return new FormGroup({
    id: new FormControl<string | null>(question?.id ?? null),
    enonce: new FormControl(question?.enonce ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(QUESTION_MAX)],
    }),
    reponseAttendue: new FormControl(question?.reponse_attendue ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(QUESTION_MAX)],
    }),
  });
}

export function buildExerciseForm(): ExerciseForm {
  return new FormGroup({
    enonce: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(SUJET_MAX)],
    }),
    questions: new FormArray<ExerciseQuestionGroup>([]),
  });
}

/**
 * Pré-remplit le formulaire depuis le `content` JSONB d'un bloc exercice,
 * sans émettre. Tolérant au contenu par défaut (`{"enonce": "", "questions":
 * []}`), au legacy sans `reponse_attendue` et au malformé (`questions` non
 * liste → aucune question). La `FormArray` existante est **mutée** (`clear` +
 * `push`), jamais remplacée : les souscriptions `valueChanges` posées sur le
 * formulaire survivent.
 */
export function patchExerciseFormFromContent(
  form: ExerciseForm,
  content: Record<string, unknown>,
): void {
  const enonce = typeof content['enonce'] === 'string' ? content['enonce'] : '';
  form.controls.enonce.setValue(enonce, { emitEvent: false });
  const questions = form.controls.questions;
  questions.clear({ emitEvent: false });
  for (const question of normalizedQuestions(content)) {
    questions.push(buildQuestionGroup(question), { emitEvent: false });
  }
}

/** Corps du PATCH : mapping camelCase → contrat back, `type` posé. */
export function payloadFromExerciseForm(form: ExerciseForm): ExerciseContentPayload {
  const v = form.getRawValue();
  return {
    enonce: v.enonce,
    questions: v.questions.map((q) => ({
      id: q.id,
      enonce: q.enonce,
      type: 'texte_libre' as const,
      reponse_attendue: q.reponseAttendue,
    })),
  };
}

/**
 * Normalise le `content` JSONB d'un bloc en payload — sert de snapshot
 * « dernier état sauvé » comparable à `payloadFromExerciseForm`.
 */
export function payloadFromBlockContent(content: Record<string, unknown>): ExerciseContentPayload {
  return {
    enonce: typeof content['enonce'] === 'string' ? content['enonce'] : '',
    questions: normalizedQuestions(content).map((q) => ({
      id: q.id,
      enonce: q.enonce,
      type: 'texte_libre' as const,
      reponse_attendue: q.reponse_attendue,
    })),
  };
}

/**
 * Markdown de l'exercice entier pour l'aperçu complet : sujet puis chaque
 * énoncé de question, blocs vides ignorés, séparés par 2 sauts de ligne. Les
 * réponses attendues (texte simple, non montrées à l'élève) sont exclues.
 */
export function fullExerciseMarkdown(form: ExerciseForm): string {
  const v = form.getRawValue();
  return joinExerciseMarkdown(v.enonce, v.questions.map((q) => q.enonce));
}

/**
 * Variante sans form de `fullExerciseMarkdown` : construit le markdown de
 * l'exercice directement depuis le `content` JSONB d'un bloc, pour l'aperçu
 * global du cours (aucun formulaire n'est monté). Mêmes règles de
 * concaténation ; réponses attendues exclues (via `payloadFromBlockContent`).
 */
export function exerciseMarkdownFromContent(content: Record<string, unknown>): string {
  const payload = payloadFromBlockContent(content);
  return joinExerciseMarkdown(
    payload.enonce,
    payload.questions.map((q) => q.enonce),
  );
}

/** Sujet + énoncés, vides ignorés, séparés par 2 sauts de ligne. */
function joinExerciseMarkdown(enonce: string, questionEnonces: string[]): string {
  return [enonce, ...questionEnonces]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join('\n\n');
}

/** Aperçu compact de l'énoncé pour l'en-tête replié d'une question (accordéon) :
    espaces normalisés (le markdown multi-lignes tient sur une ligne), tronqué.
    Chaîne vide si l'énoncé est vide. */
export function questionEnoncePreview(enonce: string, maxLength = 80): string {
  const text = enonce.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

export function addQuestion(form: ExerciseForm): void {
  form.controls.questions.push(buildQuestionGroup());
}

export function removeQuestion(form: ExerciseForm, index: number): void {
  form.controls.questions.removeAt(index);
}

/**
 * Déplace une question de `from` vers `to` (index absolu) en **réutilisant
 * l'instance de FormGroup** : le suivi `@for track group`, le signal `openGroup`
 * et le write-back `applyGeneratedIds` (matching par instance) en dépendent —
 * reconstruire un groupe régénérerait des ids censés être stables à vie (J2).
 * Une seule émission (deux mutations silencieuses). No-op aux bornes ou si égal.
 */
export function moveQuestionTo(form: ExerciseForm, from: number, to: number): void {
  const questions = form.controls.questions;
  if (from === to || from < 0 || from >= questions.length || to < 0 || to >= questions.length) {
    return;
  }
  const group = questions.at(from);
  questions.removeAt(from, { emitEvent: false });
  questions.insert(to, group, { emitEvent: false });
  // Une seule émission pour le déplacement (deux mutations silencieuses).
  questions.updateValueAndValidity();
}

/** Déplace une question d'un cran ; no-op aux bornes. */
export function moveQuestion(form: ExerciseForm, index: number, delta: 1 | -1): void {
  moveQuestionTo(form, index, index + delta);
}

/**
 * Réécrit dans les groupes les ids générés par le back (réponse du PATCH),
 * sans émettre — sinon l'autosave suivant renverrait `id: null` et le back
 * régénérerait des ids censés être stables à vie. `groups` est le snapshot
 * des groupes capturé **à l'envoi du PATCH** (aligné 1:1 sur le payload
 * envoyé, donc sur la réponse) : le matching reste correct même si des
 * questions ont bougé dans la FormArray pendant le vol — un groupe retiré
 * entre-temps reçoit son id dans le vide, sans effet. Un id déjà posé n'est
 * jamais écrasé.
 */
export function applyGeneratedIds(
  groups: readonly ExerciseQuestionGroup[],
  saved: ExerciseContentPayload,
): void {
  saved.questions.forEach((savedQuestion, i) => {
    const group = groups[i];
    if (group && group.controls.id.value === null && savedQuestion.id !== null) {
      group.controls.id.setValue(savedQuestion.id, { emitEvent: false });
    }
  });
}

function normalizedQuestions(
  content: Record<string, unknown>,
): Pick<ExerciseQuestionPayload, 'id' | 'enonce' | 'reponse_attendue'>[] {
  const raw = Array.isArray(content['questions']) ? content['questions'] : [];
  return raw
    .filter((q): q is Record<string, unknown> => typeof q === 'object' && q !== null)
    .map((q) => ({
      id: typeof q['id'] === 'string' ? q['id'] : null,
      enonce: typeof q['enonce'] === 'string' ? q['enonce'] : '',
      reponse_attendue: typeof q['reponse_attendue'] === 'string' ? q['reponse_attendue'] : '',
    }));
}
