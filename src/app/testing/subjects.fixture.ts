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
    name: 'Mathématiques',
    code: 'mathematiques',
    depth: 0,
    position: 0,
    children: [
      {
        id: 'math-algebre',
        parent_id: 'math',
        name: 'Algèbre',
        code: 'mathematiques.algebre',
        depth: 1,
        position: 0,
        children: [
          {
            id: 'math-algebre-ev',
            parent_id: 'math-algebre',
            name: 'Espaces vectoriels',
            code: 'mathematiques.algebre.espaces-vectoriels',
            depth: 2,
            position: 0,
            children: [],
          },
        ],
      },
      {
        id: 'math-analyse',
        parent_id: 'math',
        name: 'Analyse',
        code: 'mathematiques.analyse',
        depth: 1,
        position: 1,
        children: [],
      },
    ],
  },
  {
    id: 'francais',
    parent_id: null,
    name: 'Français',
    code: 'francais',
    depth: 0,
    position: 1,
    children: [
      {
        id: 'francais-grammaire',
        parent_id: 'francais',
        name: 'Grammaire',
        code: 'francais.grammaire',
        depth: 1,
        position: 0,
        children: [],
      },
    ],
  },
];
