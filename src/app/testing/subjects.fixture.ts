import { SubjectNode } from '../core/subjects/subject.model';

/**
 * Petit arbre de matières pour les tests : deux disciplines, profondeur mixte
 * (les Mathématiques descendent jusqu'au sujet ; le Français s'arrête au domaine).
 * Reflète le contrat du back sans dépendre du réseau.
 */
export const SUBJECTS_FIXTURE: SubjectNode[] = [
  {
    id: 'math',
    parent_id: null,
    nom: 'Mathématiques',
    code: 'mathematiques',
    profondeur: 0,
    position: 0,
    children: [
      {
        id: 'math-algebre',
        parent_id: 'math',
        nom: 'Algèbre',
        code: 'mathematiques.algebre',
        profondeur: 1,
        position: 0,
        children: [
          {
            id: 'math-algebre-ev',
            parent_id: 'math-algebre',
            nom: 'Espaces vectoriels',
            code: 'mathematiques.algebre.espaces-vectoriels',
            profondeur: 2,
            position: 0,
            children: [],
          },
        ],
      },
      {
        id: 'math-analyse',
        parent_id: 'math',
        nom: 'Analyse',
        code: 'mathematiques.analyse',
        profondeur: 1,
        position: 1,
        children: [],
      },
    ],
  },
  {
    id: 'francais',
    parent_id: null,
    nom: 'Français',
    code: 'francais',
    profondeur: 0,
    position: 1,
    children: [
      {
        id: 'francais-grammaire',
        parent_id: 'francais',
        nom: 'Grammaire',
        code: 'francais.grammaire',
        profondeur: 1,
        position: 0,
        children: [],
      },
    ],
  },
];
