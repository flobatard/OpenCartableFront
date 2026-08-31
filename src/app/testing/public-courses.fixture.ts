import { CourseBlock } from '../core/courses/course.model';
import { PublicCourseDetail } from '../core/public-courses/public-course.model';
import { CourseResource } from '../core/resources/resource.model';
import { COURSE_BLOCKS_FIXTURE } from './courses.fixture';

/**
 * Détail public de test — contrat élève : matières/niveaux dénormalisés en
 * **noms**, ressources et modules embarqués. Un bloc `module` complète le mix
 * de `COURSE_BLOCKS_FIXTURE` pour couvrir les quatre types.
 */
const MODULE_BLOCK: CourseBlock = {
  id: 'block-module',
  position: 3,
  type: 'module',
  title: 'Grapheur',
  description: null,
  content: {},
  resource_id: null,
  module_id: 'module-1',
};

export const PUBLIC_COURSE_DETAIL_FIXTURE: PublicCourseDetail = {
  id: 'course-1',
  title: 'Suites numériques',
  description: 'Premier chapitre d’analyse.',
  subjects: ['Mathématiques'],
  education_levels: ['6e'],
  block_count: 4,
  preview_settings: {},
  updated_at: '2026-07-06T09:30:00Z',
  blocks: [...COURSE_BLOCKS_FIXTURE, MODULE_BLOCK],
  resources: [
    {
      id: 'resource-1',
      type: 'document',
      original_name: 'schema-suites.pdf',
      size: 245_000,
      mime: 'application/pdf',
    },
  ],
  modules: [{ id: 'module-1', title: 'Quiz interactif' }],
};

/**
 * Les mêmes ressources sous la forme `CourseResource` attendue par les
 * composants de rendu — c'est la projection que fait `PublicResourceResolver`
 * (statut forcé `available`, timestamps absents du contrat public).
 */
export const PUBLIC_COURSE_RESOURCES_FIXTURE: CourseResource[] =
  PUBLIC_COURSE_DETAIL_FIXTURE.resources.map((r) => ({
    ...r,
    status: 'available' as const,
    created_at: '',
    updated_at: '',
  }));
