import { signal } from '@angular/core';
import { vi } from 'vitest';
import { ModuleSummary } from '../core/modules/module.model';
import { EDUCATION_LEVELS_FIXTURE } from './education-levels.fixture';
import { COURSE_RESOURCES_FIXTURE } from './resources.fixture';
import { SUBJECTS_FIXTURE } from './subjects.fixture';

/**
 * Mocks à signaux des services de données (comme `assistant.fixture.ts`) :
 * chaque fabrique rend la forme « sur-ensemble » du service — signaux
 * modifiables par la spec (`mock.tree.set(...)`) et `vi.fn()` pour les
 * méthodes. À appeler dans la config du TestBed (un état neuf par test).
 */

export function mockSubjectService(tree: typeof SUBJECTS_FIXTURE = SUBJECTS_FIXTURE) {
  return {
    tree: signal(tree),
    loading: signal(false),
    error: signal(false),
    load: vi.fn(),
    reload: vi.fn(),
    tree$: vi.fn(),
  };
}

export function mockEducationLevelService(
  tree: typeof EDUCATION_LEVELS_FIXTURE = EDUCATION_LEVELS_FIXTURE,
) {
  return {
    tree: signal(tree),
    loading: signal(false),
    error: signal(false),
    load: vi.fn(),
    reload: vi.fn(),
    tree$: vi.fn(),
  };
}

/**
 * `getDownloadUrl` est RÉSOLUE par défaut : les aperçus présignent dès le
 * montage (un `vi.fn()` nu renverrait `undefined` → TypeError sur le `.then`).
 */
export function mockResourceService(
  list: typeof COURSE_RESOURCES_FIXTURE = COURSE_RESOURCES_FIXTURE,
  downloadUrl = 'https://s3.test/get/x',
) {
  return {
    list: signal(list),
    listLoading: signal(false),
    listError: signal(false),
    uploadState: signal({ phase: 'idle' as const, progress: 0 }),
    loadList: vi.fn(),
    upload: vi.fn(),
    rename: vi.fn(),
    deleteResource: vi.fn(),
    getDownloadUrl: vi.fn().mockResolvedValue(downloadUrl),
  };
}

export function mockModuleService(list: ModuleSummary[] = []) {
  return {
    list: signal<ModuleSummary[]>(list),
    listLoading: signal(false),
    listError: signal(false),
    loadList: vi.fn(),
    getModule: vi.fn().mockResolvedValue(null),
    createModule: vi.fn(),
    renameModule: vi.fn(),
    updateModule: vi.fn(),
    deleteModule: vi.fn(),
  };
}
