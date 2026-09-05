import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CourseEditDialog } from './course-edit-dialog';
import { CourseUpdatePayload } from '../../../core/courses/course.model';
import { EducationLevelService } from '../../../core/education-levels/education-level.service';
import { SubjectService } from '../../../core/subjects/subject.service';
import { UserProfileService } from '../../../core/users/user-profile.service';
import { mockEducationLevelService, mockSubjectService } from '../../../testing/service-mocks';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';

/**
 * jsdom n'implémente pas la vraie modalité de <dialog> : on pilote la modale
 * par ses méthodes publiques `open()` / `close()` / `failed()` et on saisit
 * dans les champs natifs (même protocole que `BlockCreateDialog`).
 */
describe('CourseEditDialog', () => {
  const profilesMock = {
    profile: signal(null),
    ensureLoaded: vi.fn().mockResolvedValue({ school_system: 'fr' }),
  };

  async function createComponent(): Promise<ComponentFixture<CourseEditDialog>> {
    await TestBed.configureTestingModule({
      imports: [CourseEditDialog, provideTranslocoTesting()],
      providers: [
        { provide: SubjectService, useValue: mockSubjectService() },
        { provide: EducationLevelService, useValue: mockEducationLevelService() },
        { provide: UserProfileService, useValue: profilesMock },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseEditDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function course(over: Partial<Parameters<CourseEditDialog['open']>[0]> = {}) {
    return {
      title: 'Suites numériques',
      description: null,
      subject_ids: [],
      education_level_ids: [],
      ...over,
    };
  }

  function dialog(fixture: ComponentFixture<CourseEditDialog>): HTMLDialogElement {
    return (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
  }

  function field(
    fixture: ComponentFixture<CourseEditDialog>,
    name: string,
  ): HTMLInputElement & HTMLTextAreaElement {
    return (fixture.nativeElement as HTMLElement).querySelector(`[formControlName="${name}"]`)!;
  }

  function submitButton(fixture: ComponentFixture<CourseEditDialog>): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector('button[type="submit"]')!;
  }

  function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    el.value = value;
    el.dispatchEvent(new Event('input'));
  }

  it('open(course) prefills the fields and opens the dialog', async () => {
    const fixture = await createComponent();
    const showModal = (dialog(fixture).showModal = vi.fn());

    fixture.componentInstance.open(course({ subject_ids: ['math'] }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(showModal).toHaveBeenCalledOnce();
    expect(field(fixture, 'title').value).toBe('Suites numériques');
    expect(field(fixture, 'description').value).toBe(''); // null → chaîne vide
    // Le pré-remplissage n'émet pas : « Enregistrer » doit quand même être actif
    // (enregistrer sans rien changer est légitime).
    expect(submitButton(fixture).disabled).toBe(false);
  });

  it('open(course) prefills the subject picker with the current classification', async () => {
    const fixture = await createComponent();
    dialog(fixture).showModal = vi.fn();

    fixture.componentInstance.open(course({ subject_ids: ['math'] }));
    fixture.detectChanges();
    await fixture.whenStable();

    const chips = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.subject-multi-picker__chip-name'),
    ).map((c) => c.textContent?.trim());
    expect(chips).toEqual(['Mathématiques']);
  });

  it('submitting right after open sends the course unchanged', async () => {
    const fixture = await createComponent();
    dialog(fixture).showModal = vi.fn();
    fixture.componentInstance.open(course({ description: 'Chapitre 1.', subject_ids: ['math'] }));
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: CourseUpdatePayload | undefined;
    fixture.componentInstance.save.subscribe((p) => (emitted = p));
    submitButton(fixture).click();
    await fixture.whenStable();

    // Le classement du cours repart tel quel (sémantique de remplacement).
    expect(emitted).toEqual({
      title: 'Suites numériques',
      description: 'Chapitre 1.',
      subject_ids: ['math'],
      education_level_ids: [],
    });
  });

  it('submit emits the trimmed payload and marks the dialog as saving', async () => {
    const fixture = await createComponent();
    dialog(fixture).showModal = vi.fn();
    fixture.componentInstance.open(course({ title: 'Ancien titre', description: 'Ancienne' }));
    fixture.detectChanges();

    type(field(fixture, 'title'), '  Nouveau titre  ');
    type(field(fixture, 'description'), '  ');
    fixture.detectChanges();

    let emitted: CourseUpdatePayload | undefined;
    fixture.componentInstance.save.subscribe((p) => (emitted = p));
    submitButton(fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();

    // Description vidée → null explicite : le back efface le champ.
    expect(emitted).toEqual({
      title: 'Nouveau titre',
      description: null,
      subject_ids: [],
      education_level_ids: [],
    });
    // La modale ne se ferme pas d'elle-même : le parent décide après l'API.
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('a blank title disables submit (same rule as the back)', async () => {
    const fixture = await createComponent();
    dialog(fixture).showModal = vi.fn();
    fixture.componentInstance.open(course({ subject_ids: ['math'] }));
    fixture.detectChanges();

    type(field(fixture, 'title'), '   ');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(submitButton(fixture).disabled).toBe(true);

    const save = vi.fn();
    fixture.componentInstance.save.subscribe(save);
    submitButton(fixture).click();
    expect(save).not.toHaveBeenCalled();
  });

  it('failed() rearms the dialog while keeping the input', async () => {
    const fixture = await createComponent();
    dialog(fixture).showModal = vi.fn();
    fixture.componentInstance.open(course({ title: 'Ancien titre' }));
    fixture.detectChanges();
    type(field(fixture, 'title'), 'Nouveau titre');
    fixture.detectChanges();
    submitButton(fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.failed();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(submitButton(fixture).disabled).toBe(false);
    expect(field(fixture, 'title').value).toBe('Nouveau titre'); // saisie conservée
  });

  it('a backdrop click (the <dialog> itself) closes', async () => {
    const fixture = await createComponent();
    const close = (dialog(fixture).close = vi.fn());

    dialog(fixture).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(close).toHaveBeenCalledOnce();
  });
});
