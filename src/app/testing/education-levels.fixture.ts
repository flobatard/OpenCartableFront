import { EducationLevelNode } from '../core/education-levels/education-level.model';

/**
 * Petit arbre de niveaux d'étude pour les tests : deux cycles, avec les
 * variantes nulles du contrat (« Supérieur » : `cite` et `age_max` null ;
 * « Doctorat » : `age_max` null). Reflète le contrat du back sans réseau.
 */
export const EDUCATION_LEVELS_FIXTURE: EducationLevelNode[] = [
  {
    id: 'college',
    parent_id: null,
    name: 'Collège',
    code: 'fr.college',
    system: 'fr',
    cite: 2,
    age_min: 11,
    age_max: 15,
    depth: 0,
    position: 0,
    children: [
      {
        id: 'college-6e',
        parent_id: 'college',
        name: '6e',
        code: 'fr.college.6e',
        system: 'fr',
        cite: 2,
        age_min: 11,
        age_max: 12,
        depth: 1,
        position: 0,
        children: [],
      },
      {
        id: 'college-5e',
        parent_id: 'college',
        name: '5e',
        code: 'fr.college.5e',
        system: 'fr',
        cite: 2,
        age_min: 12,
        age_max: 13,
        depth: 1,
        position: 1,
        children: [],
      },
    ],
  },
  {
    id: 'superieur',
    parent_id: null,
    name: 'Supérieur',
    code: 'fr.superieur',
    system: 'fr',
    cite: null,
    age_min: 18,
    age_max: null,
    depth: 0,
    position: 1,
    children: [
      {
        id: 'superieur-doctorat',
        parent_id: 'superieur',
        name: 'Doctorat',
        code: 'fr.superieur.doctorat',
        system: 'fr',
        cite: 8,
        age_min: 23,
        age_max: null,
        depth: 1,
        position: 0,
        children: [],
      },
    ],
  },
];

/** Arbre à deux systèmes scolaires (fr + uk) pour tester le filtrage par `system`. */
export const EDUCATION_LEVELS_MULTI_SYSTEM_FIXTURE: EducationLevelNode[] = [
  ...EDUCATION_LEVELS_FIXTURE,
  {
    id: 'uk-secondary',
    parent_id: null,
    name: 'Secondary school',
    code: 'uk.secondary',
    system: 'uk',
    cite: 2,
    age_min: 11,
    age_max: 16,
    depth: 0,
    position: 0,
    children: [
      {
        id: 'uk-secondary-year7',
        parent_id: 'uk-secondary',
        name: 'Year 7',
        code: 'uk.secondary.year7',
        system: 'uk',
        cite: 2,
        age_min: 11,
        age_max: 12,
        depth: 1,
        position: 0,
        children: [],
      },
    ],
  },
];
