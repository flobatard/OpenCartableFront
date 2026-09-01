import { signal } from '@angular/core';
import { vi } from 'vitest';
import {
  AssistantPendingProposal,
  AssistantStreamState,
  AssistantToolActivity,
} from '../core/course-assistant/assistant-chat-state';
import {
  AssistantConversation,
  AssistantConversationDetail,
} from '../core/course-assistant/assistant.model';

/**
 * Mocks à signaux des services de l'assistant IA.
 *
 * - `mockAssistantChatState()` : une instance d'état de chat (la forme
 *   d'`AssistantChatState`) — à fournir comme `AssistantChatState` par toute
 *   spec montant le chat ancré en mode block (override des `providers` du
 *   composant hôte, ex. `BlockEditor` sur un bloc texte).
 * - `mockCourseAssistantService()` : le sur-ensemble root (`panelOpen` en
 *   plus) — à fournir par toute spec qui monte le panneau flottant
 *   `app-assistant-panel` ou le chat en mode global.
 *
 * Tout mode actif du chat monte aussi le bandeau réglages : fournir AUSSI
 * `mockAiCredentialsService()`. Appeler les fabriques DANS la config du
 * TestBed (un état neuf par test).
 */
export function mockAssistantChatState() {
  return {
    conversations: signal<AssistantConversation[] | null>(null),
    listLoading: signal(false),
    listError: signal(false),
    active: signal<AssistantConversationDetail | null>(null),
    activeLoading: signal(false),
    activeError: signal(false),
    streamState: signal<AssistantStreamState>('idle'),
    streamErrorStatus: signal<number | null>(null),
    streamingText: signal(''),
    streamingThinking: signal(''),
    toolActivity: signal<AssistantToolActivity[]>([]),
    pendingProposal: signal<AssistantPendingProposal | null>(null),
    configure: vi.fn(),
    setBeforeTurn: vi.fn(),
    loadConversations: vi.fn().mockResolvedValue(undefined),
    startNewConversation: vi.fn(),
    openConversation: vi.fn().mockResolvedValue(undefined),
    closeConversation: vi.fn(),
    renameConversation: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    stopStreaming: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    resumeProposal: vi.fn().mockResolvedValue(true),
  };
}

export function mockCourseAssistantService() {
  const panelOpen = signal(false);
  return {
    ...mockAssistantChatState(),
    panelOpen: panelOpen.asReadonly(),
    setPanelOpen: vi.fn((open: boolean) => panelOpen.set(open)),
  };
}

export function mockAiCredentialsService() {
  return {
    credentials: signal(null),
    ensureLoaded: vi.fn().mockResolvedValue(null),
    refresh: vi.fn().mockResolvedValue(null),
  };
}
