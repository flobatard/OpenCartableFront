import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Onboarding } from './onboarding';
import { EducationLevelService } from '../../core/education-levels/education-level.service';
import { SubjectService } from '../../core/subjects/subject.service';
import { UserProfileService } from '../../core/users/user-profile.service';
import { EDUCATION_LEVELS_MULTI_SYSTEME_FIXTURE } from '../../testing/education-levels.fixture';
import { SUBJECTS_FIXTURE } from '../../testing/subjects.fixture';
import {
  USER_PROFILE_FIXTURE,
  USER_PROFILE_ONBOARDED_FIXTURE,
} from '../../testing/user-profile.fixture';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('Onboarding', () => {
  const levelsMock = {
    tree: signal(EDUCATION_LEVELS_MULTI_SYSTEME_FIXTURE),
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
  let submitOnboarding: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  async function createComponent(next: string | null = '/fr/subjects') {
    await TestBed.configureTestingModule({
      imports: [Onboarding, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: EducationLevelService, useValue: levelsMock },
        { provide: SubjectService, useValue: subjectsMock },
        { provide: UserProfileService, useValue: { ensureLoaded, submitOnboarding } },
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
    submitOnboarding = vi.fn().mockResolvedValue(USER_PROFILE_ONBOARDED_FIXTURE);
    levelsMock.tree.set(EDUCATION_LEVELS_MULTI_SYSTEME_FIXTURE);
    levelsMock.error.set(false);
    vi.clearAllMocks();
  });

  it('redirige immédiatement vers next si le profil est déjà onboardé', async () => {
    ensureLoaded.mockResolvedValue(USER_PROFILE_ONBOARDED_FIXTURE);
    const fixture = await createComponent('/fr/subjects');

    expect(navigateByUrl).toHaveBeenCalledWith('/fr/subjects', { replaceUrl: true });
    expect(el(fixture).querySelector('.onboarding__form')).toBeNull();
  });

  it('rejette un next externe et retombe sur la page matières', async () => {
    ensureLoaded.mockResolvedValue(USER_PROFILE_ONBOARDED_FIXTURE);
    await createComponent('//evil.example');

    expect(navigateByUrl).toHaveBeenCalledWith('/fr/subjects', { replaceUrl: true });
  });

  it('la liste d’étapes dérive des rôles cochés (2 → 4 → 6)', async () => {
    const fixture = await createComponent();
    expect(stepLabels(fixture)).toHaveLength(2);

    await checkRole(fixture, 0); // prof
    expect(stepLabels(fixture)).toHaveLength(4);

    await checkRole(fixture, 1); // élève
    expect(stepLabels(fixture)).toHaveLength(6);
  });

  it('Suivant est désactivé tant qu’aucun rôle n’est coché', async () => {
    const fixture = await createComponent();
    expect(primaryButton(fixture).disabled).toBe(true);

    await checkRole(fixture, 0);
    expect(primaryButton(fixture).disabled).toBe(false);
  });

  it('décocher un rôle vide les sélections de son bloc', async () => {
    const fixture = await createComponent();
    await checkRole(fixture, 0);
    form(fixture).get('enseignement')!.setValue({
      educationLevelIds: ['college'],
      subjectIds: ['math'],
    });

    await checkRole(fixture, 0); // décoche

    expect(form(fixture).get('enseignement')!.value).toEqual({
      educationLevelIds: [],
      subjectIds: [],
    });
  });

  it('changer de système vide les niveaux des deux blocs (pas les matières)', async () => {
    const fixture = await createComponent();
    form(fixture).get('enseignement')!.setValue({
      educationLevelIds: ['college'],
      subjectIds: ['math'],
    });
    form(fixture).get('apprentissage.educationLevelIds')!.setValue(['superieur']);

    form(fixture).get('systeme')!.setValue('uk');
    await fixture.whenStable();

    expect(form(fixture).get('enseignement.educationLevelIds')!.value).toEqual([]);
    expect(form(fixture).get('apprentissage.educationLevelIds')!.value).toEqual([]);
    expect(form(fixture).get('enseignement.subjectIds')!.value).toEqual(['math']);
  });

  it('parcours complet double rôle : 6 étapes, payload exact, navigation vers next', async () => {
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

    expect(submitOnboarding).toHaveBeenCalledWith({
      est_prof: true,
      est_eleve: true,
      systeme_scolaire: 'fr',
      enseignement: {
        education_level_ids: ['college'],
        subject_ids: ['math-algebre-ev'],
      },
      apprentissage: {
        education_level_ids: ['college'],
        subject_ids: ['francais-grammaire'],
      },
    });
    expect(navigateByUrl).toHaveBeenCalledWith('/fr/subjects', { replaceUrl: true });
  });

  it('le filtrage par système est passé au picker de niveaux', async () => {
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

  it('affiche l’erreur de soumission et reste sur la page', async () => {
    submitOnboarding.mockRejectedValue(new Error('down'));
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

  it('affiche l’erreur de chargement du profil avec un bouton réessayer', async () => {
    ensureLoaded.mockRejectedValue(new Error('down'));
    const fixture = await createComponent();

    expect(el(fixture).querySelector('.onboarding__error')).not.toBeNull();

    ensureLoaded.mockResolvedValue(USER_PROFILE_FIXTURE);
    el(fixture).querySelector<HTMLButtonElement>('.btn--secondary')!.click();
    await fixture.whenStable();

    expect(el(fixture).querySelector('.onboarding__form')).not.toBeNull();
  });
});
