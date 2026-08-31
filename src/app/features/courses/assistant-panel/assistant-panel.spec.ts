import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CourseAssistantService } from '../../../core/course-assistant/course-assistant.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { AssistantPanel } from './assistant-panel';

describe('AssistantPanel', () => {
  async function createComponent(): Promise<ComponentFixture<AssistantPanel>> {
    await TestBed.configureTestingModule({
      imports: [AssistantPanel, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        {
          provide: CourseAssistantService,
          useValue: {
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
            loadConversations: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: LanguageService, useValue: { lang: () => 'fr' } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AssistantPanel);
    fixture.componentRef.setInput('courseId', 'course-1');
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: ComponentFixture<AssistantPanel>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('starts collapsed as an « Assistant » pill and expands on click', async () => {
    const fixture = await createComponent();

    const card = el(fixture).querySelector<HTMLElement>('.assistant-panel__card');
    expect(card?.hidden).toBe(true);
    const pill = el(fixture).querySelector<HTMLButtonElement>('.assistant-panel__pill');
    expect(pill?.textContent).toContain('Assistant');

    pill?.click();
    fixture.detectChanges();

    expect(card?.hidden).toBe(false);
    expect(el(fixture).querySelector('.assistant-panel__pill')).toBeNull();
  });

  it('collapses back via the chat collapse output — la carte reste montée ([hidden])', async () => {
    const fixture = await createComponent();
    el(fixture).querySelector<HTMLButtonElement>('.assistant-panel__pill')?.click();
    fixture.detectChanges();

    el(fixture).querySelector<HTMLButtonElement>('.course-chat__collapse')?.click();
    fixture.detectChanges();

    const card = el(fixture).querySelector<HTMLElement>('.assistant-panel__card');
    expect(card?.hidden).toBe(true);
    // Le chat n'est pas détruit : la conversation affichée survit au repli.
    expect(card?.querySelector('app-course-chat')).toBeTruthy();
    expect(el(fixture).querySelector('.assistant-panel__pill')).toBeTruthy();
  });
});
