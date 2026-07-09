import { CourseBlock, CourseDetail, CourseSummary } from '../core/courses/course.model';

/**
 * Cours de test alignés sur `SUBJECTS_FIXTURE` / `EDUCATION_LEVELS_FIXTURE`
 * (mêmes ids de matières/niveaux) pour que les badges se résolvent dans les
 * specs. Le second cours porte un id de matière inconnu de l'arbre : le
 * contrat « pas de chip, valeur préservée » doit tenir.
 */
export const COURSES_FIXTURE: CourseSummary[] = [
  {
    id: 'course-1',
    titre: 'Suites numériques',
    description: 'Premier chapitre d’analyse.',
    subject_ids: ['math'],
    education_level_ids: ['college-6e'],
    block_count: 3,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-06T09:30:00Z',
  },
  {
    id: 'course-2',
    titre: 'Grammaire — les accords',
    description: null,
    subject_ids: ['francais-grammaire', 'id-inconnu'],
    education_level_ids: [],
    block_count: 0,
    created_at: '2026-06-20T08:00:00Z',
    updated_at: '2026-06-21T08:00:00Z',
  },
];

export const COURSE_BLOCKS_FIXTURE: CourseBlock[] = [
  {
    id: 'block-1',
    position: 0,
    type: 'texte',
    titre: 'Le concept de suite',
    description: 'Définitions et premiers exemples.',
    content: { markdown: 'Introduction aux suites' },
    resource_id: null,
  },
  {
    id: 'block-2',
    position: 1,
    type: 'document',
    titre: null,
    description: null,
    content: { legende: 'Schéma récapitulatif', affichage: 'inline' },
    resource_id: 'resource-1',
  },
  {
    id: 'block-3',
    position: 2,
    type: 'exercice',
    titre: 'Exercices d’application',
    description: null,
    content: {
      enonce: 'Étudier la convergence des suites suivantes.',
      questions: [
        {
          id: 'q-1',
          enonce: 'Soit $u_n = 1/n$. Montrer que $(u_n)$ converge.',
          type: 'texte_libre',
          reponse_attendue: 'Décroissante et minorée par 0 ; limite 0.',
        },
      ],
    },
    resource_id: null,
  },
];

export const COURSE_DETAIL_FIXTURE: CourseDetail = {
  ...COURSES_FIXTURE[0],
  blocks: COURSE_BLOCKS_FIXTURE,
};
