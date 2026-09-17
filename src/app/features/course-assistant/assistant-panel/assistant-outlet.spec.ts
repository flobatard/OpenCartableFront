import { signal } from '@angular/core';
import { ComponentFixture, DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EMPTY } from 'rxjs';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';
import { AuthService } from '../../../core/auth/auth.service';
import { CourseAssistantService } from '../../../core/course-assistant/course-assistant.service';
import {
  mockAiCredentialsService,
  mockCourseAssistantService,
} from '../../../testing/assistant.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { AssistantOutlet, courseIdFromUrl, isEditorUrl } from './assistant-outlet';

describe('courseIdFromUrl', () => {
  it("extracts the course id from every page of the authoring space", () => {
    expect(courseIdFromUrl('/fr/courses/course-1')).toBe('course-1');
    expect(courseIdFromUrl('/fr/courses/course-1?tab=resources')).toBe('course-1');
    expect(courseIdFromUrl('/fr/courses/course-1/blocks/block-9')).toBe('course-1');
    expect(courseIdFromUrl('/en/courses/course-1/modules/module-2')).toBe('course-1');
    expect(courseIdFromUrl('/fr/courses/course-1/resources/r-1')).toBe('course-1');
  });

  it('matches neither the list, nor creation, nor public/student pages', () => {
    expect(courseIdFromUrl('/fr/courses')).toBeNull();
    expect(courseIdFromUrl('/fr/courses/new')).toBeNull();
    expect(courseIdFromUrl('/fr/p/courses/course-1')).toBeNull();
    expect(courseIdFromUrl('/fr/shared/token123')).toBeNull();
    expect(courseIdFromUrl('/fr/search?q=suites')).toBeNull();
    expect(courseIdFromUrl('/')).toBeNull();
  });

  it('rejects ids outside the safe charset (interpolated into API URLs)', () => {
    expect(courseIdFromUrl('/fr/courses/%2e%2e')).toBeNull();
    expect(courseIdFromUrl('/fr/courses/a.b')).toBeNull();
  });
});

describe('isEditorUrl', () => {
  it('recognises the block and module editors only', () => {
    expect(isEditorUrl('/fr/courses/course-1/blocks/block-9')).toBe(true);
    expect(isEditorUrl('/en/courses/course-1/modules/module-2?x=1')).toBe(true);
    expect(isEditorUrl('/fr/courses/course-1')).toBe(false);
    expect(isEditorUrl('/fr/courses/course-1/resources/r-1')).toBe(false);
    expect(isEditorUrl('/fr/p/courses/course-1/blocks/block-9')).toBe(false);
  });
});

describe('AssistantOutlet', () => {
  async function createComponent(
    url: string,
    authenticated = true,
  ): Promise<ComponentFixture<AssistantOutlet>> {
    await TestBed.configureTestingModule({
      imports: [AssistantOutlet, provideTranslocoTesting()],
      // Le panneau vit derrière un @defer : on le laisse jouer comme en prod.
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
      providers: [
        { provide: Router, useValue: { url, events: EMPTY } },
        { provide: AuthService, useValue: { isAuthenticated: signal(authenticated) } },
        { provide: CourseAssistantService, useValue: mockCourseAssistantService() },
        { provide: AiCredentialsService, useValue: mockAiCredentialsService() },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AssistantOutlet);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<AssistantOutlet>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('mounts the assistant panel on an authoring course URL', async () => {
    const fixture = await createComponent('/fr/courses/course-1/blocks/block-2');
    expect(el(fixture).querySelector('app-assistant-panel')).toBeTruthy();
    expect(el(fixture).querySelector('.assistant-panel__pill')?.textContent).toContain('Assistant');
  });

  it('flags the panel on an editor page (hidden there on narrow screens)', async () => {
    const editor = await createComponent('/fr/courses/course-1/blocks/block-2');
    expect(el(editor).querySelector('app-assistant-panel')?.classList).toContain(
      'assistant-panel--in-editor',
    );
    TestBed.resetTestingModule();
    const course = await createComponent('/fr/courses/course-1');
    expect(el(course).querySelector('app-assistant-panel')?.classList).not.toContain(
      'assistant-panel--in-editor',
    );
  });

  it('mounts the global proposal review next to the panel (never inside it)', async () => {
    const fixture = await createComponent('/fr/courses/course-1/blocks/block-2');
    const review = el(fixture).querySelector('app-global-proposal-review');
    expect(review).toBeTruthy();
    expect(review!.closest('app-assistant-panel')).toBeNull();
    expect(review!.querySelector('dialog.global-proposal-review')).toBeTruthy();
  });

  it('mounts nothing outside the course space', async () => {
    const fixture = await createComponent('/fr/search');
    expect(el(fixture).querySelector('app-assistant-panel')).toBeNull();
    expect(el(fixture).querySelector('app-global-proposal-review')).toBeNull();
  });

  it('mounts nothing when unauthenticated (belt and braces over the guards)', async () => {
    const fixture = await createComponent('/fr/courses/course-1', false);
    expect(el(fixture).querySelector('app-assistant-panel')).toBeNull();
  });
});
