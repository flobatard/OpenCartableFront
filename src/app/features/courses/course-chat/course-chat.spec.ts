import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  AssistantConversation,
  AssistantConversationDetail,
  AssistantMessage,
} from '../../../core/course-assistant/assistant.model';
import {
  AssistantStreamState,
  AssistantToolActivity,
  CourseAssistantService,
} from '../../../core/course-assistant/course-assistant.service';
import { COURSE_RESOURCE_RESOLVER } from '../../../core/course-content/course-content-resolvers';
import { LanguageService } from '../../../core/i18n/language.service';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { CourseChat, STREAM_REVEAL_TICK_MS } from './course-chat';

const BLOCK_UUID = '11111111-1111-4111-8111-111111111111';

const CONVERSATION: AssistantConversation = {
  id: 'conv-1',
  context: 'course',
  block_id: null,
  module_id: null,
  title: 'Synthèse du chapitre',
  created_at: '2026-08-31T10:00:00Z',
  updated_at: '2026-08-31T10:00:00Z',
};

function emptyDetail(): AssistantConversationDetail {
  return { ...CONVERSATION, messages: [] };
}

function message(
  partial: Partial<AssistantMessage> & Pick<AssistantMessage, 'id' | 'role'>,
): AssistantMessage {
  return {
    position: 0,
    content: '',
    tool_calls: [],
    tool_call_id: null,
    is_error: false,
    sources: {},
    input_tokens: null,
    output_tokens: null,
    created_at: '2026-08-31T10:00:00Z',
    ...partial,
  };
}

function mockAssistant() {
  return {
    conversations: signal<AssistantConversation[] | null>([]),
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
    loadConversations: vi.fn().mockResolvedValue(undefined),
    createConversation: vi.fn().mockResolvedValue(undefined),
    openConversation: vi.fn().mockResolvedValue(undefined),
    closeConversation: vi.fn(),
    renameConversation: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    stopStreaming: vi.fn(),
  };
}

describe('CourseChat', () => {
  let assistant: ReturnType<typeof mockAssistant>;

  async function createComponent(
    inputs: Partial<{ blockId: string; moduleId: string }> = {},
  ): Promise<ComponentFixture<CourseChat>> {
    assistant = mockAssistant();
    await TestBed.configureTestingModule({
      imports: [CourseChat, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: CourseAssistantService, useValue: assistant },
        { provide: LanguageService, useValue: { lang: () => 'fr' } },
        // Le markdown-view des réponses injecte le résolveur de ressources
        // (impl. prof → AuthService → OAuthService, absent du TestBed).
        {
          provide: COURSE_RESOURCE_RESOLVER,
          useValue: {
            list: signal([]),
            listLoading: signal(false),
            ensureList: vi.fn(),
            getDownloadUrl: vi.fn().mockResolvedValue('https://s3.example/x'),
            contentUrl: vi.fn().mockReturnValue('/fr/courses/course-1/resources/r1'),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseChat);
    // input.required : poser les inputs AVANT le premier detectChanges.
    fixture.componentRef.setInput('courseId', 'course-1');
    if (inputs.blockId) {
      fixture.componentRef.setInput('blockId', inputs.blockId);
    }
    if (inputs.moduleId) {
      fixture.componentRef.setInput('moduleId', inputs.moduleId);
    }
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: ComponentFixture<CourseChat>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  describe('mode placeholder (hôtes éditeurs)', () => {
    it('renders the header, the empty state and a disabled input', async () => {
      const fixture = await createComponent({ blockId: 'block-1' });

      expect(el(fixture).querySelector('.course-chat__title')?.textContent).toContain('Assistant');
      expect(el(fixture).querySelector('.course-chat__badge')?.textContent).toContain('Bientôt');
      expect(el(fixture).querySelector('.course-chat__empty')).toBeTruthy();

      const textarea = el(fixture).querySelector<HTMLTextAreaElement>('.course-chat__input');
      expect(textarea?.disabled).toBe(true);
      // Le câblage IA ne s'active jamais depuis un hôte éditeur.
      expect(assistant.loadConversations).not.toHaveBeenCalled();
    });

    it('emits collapse on the collapse button click', async () => {
      const fixture = await createComponent({ blockId: 'block-1' });
      const spy = vi.fn();
      fixture.componentInstance.collapse.subscribe(spy);

      el(fixture).querySelector<HTMLButtonElement>('.course-chat__collapse')?.click();

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('mode global (panneau flottant)', () => {
    it('loads and lists the conversations of the course', async () => {
      const fixture = await createComponent();
      assistant.conversations.set([CONVERSATION]);
      fixture.detectChanges();

      expect(assistant.loadConversations).toHaveBeenCalledWith('course-1');
      expect(el(fixture).querySelector('.course-chat__conversation-title')?.textContent).toContain(
        'Synthèse du chapitre',
      );
    });

    it('opens a conversation from the list', async () => {
      const fixture = await createComponent();
      assistant.conversations.set([CONVERSATION]);
      fixture.detectChanges();

      el(fixture).querySelector<HTMLButtonElement>('.course-chat__conversation-open')?.click();

      expect(assistant.openConversation).toHaveBeenCalledWith('conv-1');
    });

    it('deletes a conversation in two steps, disarmed on blur', async () => {
      const fixture = await createComponent();
      assistant.conversations.set([CONVERSATION]);
      fixture.detectChanges();

      const deleteButton = el(fixture).querySelector<HTMLButtonElement>(
        '.course-chat__conversation-delete',
      );
      deleteButton?.click();
      fixture.detectChanges();
      expect(deleteButton?.textContent).toContain('Confirmer ?');
      expect(assistant.deleteConversation).not.toHaveBeenCalled();

      deleteButton?.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(deleteButton?.textContent).toContain('Supprimer');

      deleteButton?.click();
      fixture.detectChanges();
      deleteButton?.click();
      expect(assistant.deleteConversation).toHaveBeenCalledWith('conv-1');
    });

    it('sends the draft and clears the composer', async () => {
      const fixture = await createComponent();
      assistant.active.set(emptyDetail());
      fixture.detectChanges();

      const textarea = el(fixture).querySelector<HTMLTextAreaElement>('.course-chat__input')!;
      textarea.value = 'Fais une synthèse';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      el(fixture).querySelector<HTMLButtonElement>('.course-chat__send')?.click();

      expect(assistant.sendMessage).toHaveBeenCalledWith('Fais une synthèse');
      fixture.detectChanges();
      expect(textarea.value).toBe('');
    });

    it('shows Stop and disables the composer while streaming', async () => {
      const fixture = await createComponent();
      assistant.active.set(emptyDetail());
      assistant.streamState.set('streaming');
      fixture.detectChanges();

      const textarea = el(fixture).querySelector<HTMLTextAreaElement>('.course-chat__input');
      expect(textarea?.disabled).toBe(true);

      const stop = el(fixture).querySelector<HTMLButtonElement>('.course-chat__send');
      expect(stop?.textContent).toContain('Arrêter');
      stop?.click();
      expect(assistant.stopStreaming).toHaveBeenCalled();
    });

    it('maps a 429 stream error to the quota message with a settings link', async () => {
      const fixture = await createComponent();
      assistant.active.set(emptyDetail());
      assistant.streamState.set('error');
      assistant.streamErrorStatus.set(429);
      fixture.detectChanges();

      const alert = el(fixture).querySelector('.course-chat__alert');
      expect(alert?.textContent).toContain('Quota quotidien');
      expect(alert?.querySelector('a')?.getAttribute('href')).toContain('/fr/settings/ai');
    });

    it('renders persisted tool calls as expandable details with parameters and error', async () => {
      const fixture = await createComponent();
      assistant.active.set({
        ...emptyDetail(),
        messages: [
          message({ id: 'u1', role: 'user', content: 'Lis le bloc' }),
          message({
            id: 'a1',
            role: 'assistant',
            tool_calls: [
              { id: 'c1', name: 'read_block', arguments: { block_id: 'b1' } },
              { id: 'c2', name: 'read_module', arguments: { module_id: 'm1' } },
            ],
          }),
          message({
            id: 't1',
            role: 'tool',
            tool_call_id: 'c1',
            is_error: true,
            content: 'Bloc introuvable dans ce cours',
          }),
          message({ id: 't2', role: 'tool', tool_call_id: 'c2', content: 'x'.repeat(1000) }),
          message({ id: 'a2', role: 'assistant', content: 'Réponse' }),
        ],
      });
      fixture.detectChanges();

      const tools = el(fixture).querySelectorAll('details.chat-tool');
      expect(tools.length).toBe(2);
      expect(tools[0].classList.contains('chat-tool--error')).toBe(true);
      expect(tools[0].textContent).toContain("Lecture d'un bloc du cours");
      expect(tools[0].querySelector('dt')?.textContent).toBe('block_id');
      expect(tools[0].querySelector('dd')?.textContent).toBe('b1');
      expect(tools[0].querySelector('.chat-tool__result')?.textContent).toBe(
        'Bloc introuvable dans ce cours',
      );
      // Résultat long : extrait borné, jamais le contenu complet dans le DOM.
      expect(tools[1].classList.contains('chat-tool--error')).toBe(false);
      expect(tools[1].querySelector('.chat-tool__result')?.textContent).toBe('x'.repeat(400) + '…');
    });

    it('renders live tool activity while streaming', async () => {
      const fixture = await createComponent();
      assistant.active.set(emptyDetail());
      assistant.streamState.set('streaming');
      assistant.toolActivity.set([
        {
          id: 'c1',
          name: 'read_resource_image',
          status: 'running',
          args: { resource_id: 'r1' },
          result: null,
        },
      ]);
      fixture.detectChanges();

      const tool = el(fixture).querySelector('details.chat-tool')!;
      expect(tool.classList.contains('chat-tool--running')).toBe(true);
      expect(tool.textContent).toContain("Lecture d'une image de la bibliothèque");
      expect(tool.textContent).toContain('en cours');
      expect(tool.querySelector('dd')?.textContent).toBe('r1');
    });

    it('reveals the streamed text progressively, tick by tick', async () => {
      vi.useFakeTimers();
      try {
        const fixture = await createComponent();
        assistant.active.set(emptyDetail());
        assistant.streamState.set('streaming');
        assistant.streamingText.set('Bonjour tout le monde');
        fixture.detectChanges();

        const render = () => fixture.componentInstance['streamingRender']();
        expect(render()).toBe('');
        vi.advanceTimersByTime(STREAM_REVEAL_TICK_MS);
        // 21 caractères de retard → 30 % rattrapés (7), pas tout d'un coup.
        expect(render()).toBe('Bonjour');
        vi.advanceTimersByTime(STREAM_REVEAL_TICK_MS * 20);
        expect(render()).toBe('Bonjour tout le monde');

        // Fin de tour : le rendu streamé est vidé.
        assistant.streamingText.set('');
        fixture.detectChanges();
        expect(render()).toBe('');
      } finally {
        vi.useRealTimers();
      }
    });

    it('navigates to the cited block on citation click (re-garde uuid)', async () => {
      const fixture = await createComponent();
      assistant.active.set(emptyDetail());
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const log = el(fixture).querySelector<HTMLElement>('.course-chat__thread')!;
      const cited = document.createElement('a');
      cited.setAttribute('data-oc-block-id', BLOCK_UUID);
      const forged = document.createElement('a');
      forged.setAttribute('data-oc-block-id', '../evil');
      log.append(cited, forged);

      forged.click();
      expect(navigate).not.toHaveBeenCalled();

      cited.click();
      expect(navigate).toHaveBeenCalledWith([
        '/',
        'fr',
        'courses',
        'course-1',
        'blocks',
        BLOCK_UUID,
      ]);
    });
  });
});
