import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Onboarding } from './onboarding';
import { EducationLevelService } from '../../core/education-levels/education-level.service';
import { SubjectService } from '../../core/subjects/subject.service';
import { UserProfileService } from '../../core/users/user-profile.service';
import { EDUCATION_LEVELS_MULTI_SYSTEM_FIXTURE } from '../../testing/education-levels.fixture';
import { SUBJECTS_FIXTURE } from '../../testing/subjects.fixture';
import {
  USER_PROFILE_FIXTURE,
  USER_PROFILE_ONBOARDED_FIXTURE,
} from '../../testing/user-profile.fixture';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('Onboarding', () => {
  const levelsMock = {
    tree: signal(EDUCATION_LEVELS_MULTI_SYSTEM_FIXTURE),
    loading: signal(false),
    error: signal(false),
    load: vi.fn(),
    reload: vi.fn(),
    tree$: vi.fn(),
  };
  const subjectsMock = {
    tree: signal(SUBJECTS_FIXTURE),
    loading: signal(false),
    error: signal(false),
    load: vi.fn(),
    reload: vi.fn(),
    tree$: vi.fn(),
  };

  let ensureLoaded: ReturnType<typeof vi.fn>;
  let saveProfile: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  async function createComponent(next: string | null = '/fr/subjects') {
    await TestBed.configureTestingModule({
      imports: [Onboarding, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: EducationLevelService, useValue: levelsMock },
        { provide: SubjectService, useValue: subjectsMock },
        { provide: UserProfileService, useValue: { ensureLoaded, saveProfile } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(next ? { next } : {}) } },
        },
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true) as ReturnType<
      typeof vi.fn
    >;
    const fixture = TestBed.createComponent(Onboarding);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<Onboarding>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Accès au FormGroup protégé, pour les assertions d'état interne. */
  function form(fixture: ComponentFixture<Onboarding>) {
    return (fixture.componentInstance as unknown as { form: FormGroup }).form;
  }

  function stepLabels(fixture: ComponentFixture<Onboarding>): string[] {
    return [...el(fixture).querySelectorAll('.onboarding__step')].map(
      (s) => s.textContent?.trim() ?? '',
    );
  }

  function roleCheckboxes(fixture: ComponentFixture<Onboarding>): HTMLInputElement[] {
    return [...el(fixture).querySelectorAll<HTMLInputElement>('.onboarding__role-checkbox')];
  }

  function primaryButton(fixture: ComponentFixture<Onboarding>): HTMLButtonElement {
    return el(fixture).querySelector<HTMLButtonElement>('.onboarding__actions .btn--primary')!;
  }

  async function clickNext(fixture: ComponentFixture<Onboarding>): Promise<void> {
    primaryButton(fixture).click();
    await fixture.whenStable();
  }

  async function checkRole(fixture: ComponentFixture<Onboarding>, index: 0 | 1): Promise<void> {
    roleCheckboxes(fixture)[index].click();
    await fixture.whenStable();
  }

  async function pickRadio(fixture: ComponentFixture<Onboarding>, label: string): Promise<void> {
    const radio = [...el(fixture).querySelectorAll('.onboarding__radio')].find((r) =>
      r.textContent?.includes(label),
    );
    radio?.querySelector<HTMLInputElement>('input')?.click();
    await fixture.whenStable();
  }

  async function pickFirstLevel(fixture: ComponentFixture<Onboarding>): Promise<void> {
    el(fixture).querySelector<HTMLButtonElement>('.education-level-picker__field')!.click();
    await fixture.whenStable();
    el(fixture).querySelector<HTMLInputElement>('.education-level-picker__checkbox')!.click();
    await fixture.whenStable();
  }

  async function pickSubject(fixture: ComponentFixture<Onboarding>, term: string): Promise<void> {
    el(fixture).querySelector<HTMLButtonElement>('.subject-picker__field')!.click();
    await fixture.whenStable();
    const search = el(fixture).querySelector<HTMLInputElement>('.subject-picker__search')!;
    search.value = term;
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    el(fixture).querySelector<HTMLElement>('.subject-picker__option--flat')!.click();
    await fixture.whenStable();
  }

  beforeEach(() => {
    ensureLoaded = vi.fn().mockResolvedValue(USER_PROFILE_FIXTURE);
    saveProfile = vi.fn().mockResolvedValue(USER_PROFILE_ONBOARDED_FIXTURE);
    levelsMock.tree.set(EDUCATION_LEVELS_MULTI_SYSTEM_FIXTURE);
    levelsMock.error.set(false);
    vi.clearAllMocks();
  });

  it('redirects immediately to next when the profile is already onboarded', async () => {
    ensureLoaded.mockResolvedValue(USER_PROFILE_ONBOARDED_FIXTURE);
    const fixture = await createComponent('/fr/subjects');

    expect(navigateByUrl).toHaveBeenCalledWith('/fr/subjects', { replaceUrl: true });
    expect(el(fixture).querySelector('.onboarding__form')).toBeNull();
  });

  it('rejects an external next and falls back to the subjects page', async () => {
    ensureLoaded.mockResolvedValue(USER_PROFILE_ONBOARDED_FIXTURE);
    await createComponent('//evil.example');

    expect(navigateByUrl).toHaveBeenCalledWith('/fr/subjects', { replaceUrl: true });
  });

  it('the step list derives from the checked roles (2 → 4 → 6)', async () => {
    const fixture = await createComponent();
    expect(stepLabels(fixture)).toHaveLength(2);

    await checkRole(fixture, 0); // prof
    expect(stepLabels(fixture)).toHaveLength(4);

    await checkRole(fixture, 1); // élève
    expect(stepLabels(fixture)).toHaveLength(6);
  });

  it('Next is disabled while no role is checked', async () => {
    const fixture = await createComponent();
    expect(primaryButton(fixture).disabled).toBe(true);

    await checkRole(fixture, 0);
    expect(primaryButton(fixture).disabled).toBe(false);
  });

  it('unchecking a role clears its block’s selections', async () => {
    const fixture = await createComponent();
    await checkRole(fixture, 0);
    form(fixture).get('teaching')!.setValue({
      educationLevelIds: ['college'],
      subjectIds: ['math'],
    });

    await checkRole(fixture, 0); // décoche

    expect(form(fixture).get('teaching')!.value).toEqual({
      educationLevelIds: [],
      subjectIds: [],
    });
  });

  it('changing system clears the levels of both blocks (not the subjects)', async () => {
    const fixture = await createComponent();
    form(fixture).get('teaching')!.setValue({
      educationLevelIds: ['college'],
      subjectIds: ['math'],
    });
    form(fixture).get('learning.educationLevelIds')!.setValue(['superieur']);

    form(fixture).get('system')!.setValue('uk');
    await fixture.whenStable();

    expect(form(fixture).get('teaching.educationLevelIds')!.value).toEqual([]);
    expect(form(fixture).get('learning.educationLevelIds')!.value).toEqual([]);
    expect(form(fixture).get('teaching.subjectIds')!.value).toEqual(['math']);
  });

  it('full dual-role flow: 6 steps, exact payload, navigation to next', async () => {
    const fixture = await createComponent('/fr/subjects');

    await checkRole(fixture, 0);
    await checkRole(fixture, 1);
    await clickNext(fixture); // → système

    await pickRadio(fixture, 'France');
    await clickNext(fixture); // → niveaux enseignés

    await pickFirstLevel(fixture); // « Collège » (arbre filtré fr)
    await clickNext(fixture); // → matières enseignées

    await pickSubject(fixture, 'espaces');
    await clickNext(fixture); // → niveaux étudiés

    await pickFirstLevel(fixture);
    await clickNext(fixture); // → matières apprises

    await pickSubject(fixture, 'grammaire');
    primaryButton(fixture).click(); // Terminer
    await fixture.whenStable();

    expect(saveProfile).toHaveBeenCalledWith({
      is_teacher: true,
      is_student: true,
      school_system: 'fr',
      public_name: null,
      searchable: false,
      teaching: {
        education_level_ids: ['college'],
        subject_ids: ['math-algebre-ev'],
      },
      learning: {
        education_level_ids: ['college'],
        subject_ids: ['francais-grammaire'],
      },
    });
    expect(navigateByUrl).toHaveBeenCalledWith('/fr/subjects', { replaceUrl: true });
  });

  it('the system filter is passed to the level picker', async () => {
    const fixture = await createComponent();
    await checkRole(fixture, 0);
    await clickNext(fixture);
    await pickRadio(fixture, 'Royaume-Uni');
    await clickNext(fixture);

    el(fixture).querySelector<HTMLButtonElement>('.education-level-picker__field')!.click();
    await fixture.whenStable();
    const labels = [...el(fixture).querySelectorAll('.education-level-picker__label')].map(
      (l) => l.textContent?.trim(),
    );
    expect(labels).toEqual(['Secondary school', 'Year 7']);
  });

  it('shows the submit error and stays on the page', async () => {
    saveProfile.mockRejectedValue(new Error('down'));
    const fixture = await createComponent();

    await checkRole(fixture, 0);
    await clickNext(fixture);
    await pickRadio(fixture, 'France');
    await clickNext(fixture);
    await pickFirstLevel(fixture);
    await clickNext(fixture);
    await pickSubject(fixture, 'espaces');
    primaryButton(fixture).click();
    await fixture.whenStable();

    expect(el(fixture).querySelector('.onboarding__error')).not.toBeNull();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('shows the profile load error with a retry button', async () => {
    ensureLoaded.mockRejectedValue(new Error('down'));
    const fixture = await createComponent();

    expect(el(fixture).querySelector('.onboarding__error')).not.toBeNull();

    ensureLoaded.mockResolvedValue(USER_PROFILE_FIXTURE);
    el(fixture).querySelector<HTMLButtonElement>('.btn--secondary')!.click();
    await fixture.whenStable();

    expect(el(fixture).querySelector('.onboarding__form')).not.toBeNull();
  });
});
