import { CourseResource } from '../core/resources/resource.model';

/**
 * Bibliothèque de test du cours `course-1` (cf. `courses.fixture.ts` : le bloc
 * document `block-2` pointe `resource-1`). Statuts mixtes : la ressource
 * `en_attente` doit rester listée (atténuée) mais jamais proposée au picker
 * des blocs document ni téléchargeable.
 */
export const COURSE_RESOURCES_FIXTURE: CourseResource[] = [
  {
    id: 'resource-1',
    type: 'document',
    nom_original: 'schema-suites.pdf',
    taille: 245_000,
    mime: 'application/pdf',
    statut: 'disponible',
    created_at: '2026-07-05T10:00:00Z',
    updated_at: '2026-07-05T10:05:00Z',
  },
  {
    id: 'resource-2',
    type: 'image',
    nom_original: 'illustration.png',
    taille: 1_800_000,
    mime: 'image/png',
    statut: 'disponible',
    created_at: '2026-07-04T09:00:00Z',
    updated_at: '2026-07-04T09:01:00Z',
  },
  {
    id: 'resource-3',
    type: 'video',
    nom_original: 'capsule.mp4',
    taille: 52_000_000,
    mime: 'video/mp4',
    statut: 'en_attente',
    created_at: '2026-07-06T14:00:00Z',
    updated_at: '2026-07-06T14:00:00Z',
  },
];
