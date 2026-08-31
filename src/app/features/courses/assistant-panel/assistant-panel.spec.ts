import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';
import { CourseAssistantService } from '../../../core/course-assistant/course-assistant.service';
import { LanguageService } from '../../../core/i18n/language.service';
import {
  mockAiCredentialsService,
  mockCourseAssistantService,
} from '../../../testing/assistant.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { AssistantPanel } from './assistant-panel';

describe('AssistantPanel', () => {
  async function createComponent(): Promise<ComponentFixture<AssistantPanel>> {
    await TestBed.configureTestingModule({
      imports: [AssistantPanel, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        // L'état plié/déplié vit dans le service (partagé entre les hôtes) :
        // le mock fait vivre le signal panelOpen.
        { provide: CourseAssistantService, useValue: mockCourseAssistantService() },
        // Le chat en mode global lit aussi le credential IA (bandeau modèle/quota).
        { provide: AiCredentialsService, useValue: mockAiCredentialsService() },
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
