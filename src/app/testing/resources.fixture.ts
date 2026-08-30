import { CourseResource } from '../core/resources/resource.model';

/**
 * Bibliothèque de test du cours `course-1` (cf. `courses.fixture.ts` : le bloc
 * document `block-2` pointe `resource-1`). Statuts mixtes : la ressource
 * `pending` doit rester listée (atténuée) mais jamais proposée au picker
 * des blocs document ni téléchargeable.
 */
export const COURSE_RESOURCES_FIXTURE: CourseResource[] = [
  {
    id: 'resource-1',
    type: 'document',
    original_name: 'schema-suites.pdf',
    size: 245_000,
    mime: 'application/pdf',
    status: 'available',
    created_at: '2026-07-05T10:00:00Z',
    updated_at: '2026-07-05T10:05:00Z',
  },
  {
    id: 'resource-2',
    type: 'image',
    original_name: 'illustration.png',
    size: 1_800_000,
    mime: 'image/png',
    status: 'available',
    created_at: '2026-07-04T09:00:00Z',
    updated_at: '2026-07-04T09:01:00Z',
  },
  {
    id: 'resource-3',
    type: 'video',
    original_name: 'capsule.mp4',
    size: 52_000_000,
    mime: 'video/mp4',
    status: 'pending',
    created_at: '2026-07-06T14:00:00Z',
    updated_at: '2026-07-06T14:00:00Z',
  },
];
