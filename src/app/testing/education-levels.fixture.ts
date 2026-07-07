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
    nom: 'Collège',
    code: 'fr.college',
    systeme: 'fr',
    cite: 2,
    age_min: 11,
    age_max: 15,
    profondeur: 0,
    position: 0,
    children: [
      {
        id: 'college-6e',
        parent_id: 'college',
        nom: '6e',
        code: 'fr.college.6e',
        systeme: 'fr',
        cite: 2,
        age_min: 11,
        age_max: 12,
        profondeur: 1,
        position: 0,
        children: [],
      },
      {
        id: 'college-5e',
        parent_id: 'college',
        nom: '5e',
        code: 'fr.college.5e',
        systeme: 'fr',
        cite: 2,
        age_min: 12,
        age_max: 13,
        profondeur: 1,
        position: 1,
        children: [],
      },
    ],
  },
  {
    id: 'superieur',
    parent_id: null,
    nom: 'Supérieur',
    code: 'fr.superieur',
    systeme: 'fr',
    cite: null,
    age_min: 18,
    age_max: null,
    profondeur: 0,
    position: 1,
    children: [
      {
        id: 'superieur-doctorat',
        parent_id: 'superieur',
        nom: 'Doctorat',
        code: 'fr.superieur.doctorat',
        systeme: 'fr',
        cite: 8,
        age_min: 23,
        age_max: null,
        profondeur: 1,
        position: 0,
        children: [],
      },
    ],
  },
];
