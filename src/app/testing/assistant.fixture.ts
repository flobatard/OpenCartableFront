import { signal } from '@angular/core';
import { vi } from 'vitest';

/**
 * Mocks à signaux des services de l'assistant IA — à fournir par TOUTE spec
 * qui monte le panneau flottant `app-assistant-panel` (page cours, éditeur de
 * bloc, éditeur de module) ou le chat en mode global : le chat y résout
 * `CourseAssistantService` et son bandeau réglages `AiCredentialsService`.
 * Appeler les fabriques DANS la config du TestBed (un état neuf par test).
 */
export function mockCourseAssistantService() {
  const panelOpen = signal(false);
  return {
    conversations: signal(null),
    listLoading: signal(false),
    listError: signal(false),
    active: signal(null),
    activeLoading: signal(false),
    activeError: signal(false),
    streamState: signal('idle'),
    streamErrorStatus: signal(null),
    streamingText: signal(''),
    streamingThinking: signal(''),
    toolActivity: signal([]),
    panelOpen: panelOpen.asReadonly(),
    setPanelOpen: vi.fn((open: boolean) => panelOpen.set(open)),
    loadConversations: vi.fn().mockResolvedValue(undefined),
  };
}

export function mockAiCredentialsService() {
  return {
    credentials: signal(null),
    ensureLoaded: vi.fn().mockResolvedValue(null),
    refresh: vi.fn().mockResolvedValue(null),
  };
}
