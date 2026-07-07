import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { CourseCreate } from './course-create';
import { CourseService } from '../../../core/courses/course.service';
import { EducationLevelService } from '../../../core/education-levels/education-level.service';
import { SubjectService } from '../../../core/subjects/subject.service';
import { UserProfileService } from '../../../core/users/user-profile.service';
import { EducationLevelPicker } from '../../../shared/education-level-picker/education-level-picker';
import { COURSES_FIXTURE } from '../../../testing/courses.fixture';
import { EDUCATION_LEVELS_FIXTURE } from '../../../testing/education-levels.fixture';
import { SUBJECTS_FIXTURE } from '../../../testing/subjects.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { USER_PROFILE_ONBOARDED_FIXTURE } from '../../../testing/user-profile.fixture';

describe('CourseCreate', () => {
  const coursesMock = { createCourse: vi.fn() };
  const profilesMock = { ensureLoaded: vi.fn() };
  const subjectsMock = {
    tree: signal(SUBJECTS_FIXTURE),
    loading: signal(false),
    error: signal(false),
    load: vi.fn(),
    reload: vi.fn(),
  };
  const levelsMock = {
    tree: signal(EDUCATION_LEVELS_FIXTURE),
    loading: signal(false),
    error: signal(false),
    load: vi.fn(),
    reload: vi.fn(),
  };

  async function createComponent(): Promise<ComponentFixture<CourseCreate>> {
    await TestBed.configureTestingModule({
      imports: [CourseCreate, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: CourseService, useValue: coursesMock },
        { provide: UserProfileService, useValue: profilesMock },
        { provide: SubjectService, useValue: subjectsMock },
        { provide: EducationLevelService, useValue: levelsMock },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseCreate);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<CourseCreate>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function submitButton(fixture: ComponentFixture<CourseCreate>): HTMLButtonElement {
    return el(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
  }

  async function setTitre(fixture: ComponentFixture<CourseCreate>, value: string): Promise<void> {
    const input = el(fixture).querySelector<HTMLInputElement>('#course-titre')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function submit(fixture: ComponentFixture<CourseCreate>): Promise<void> {
    el(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    coursesMock.createCourse.mockResolvedValue(COURSES_FIXTURE[0]);
    profilesMock.ensureLoaded.mockResolvedValue(USER_PROFILE_ONBOARDED_FIXTURE);
  });

  it('désactive la création tant que le titre est blanc', async () => {
    const fixture = await createComponent();
    expect(submitButton(fixture).disabled).toBe(true);

    await setTitre(fixture, '   ');
    expect(submitButton(fixture).disabled).toBe(true);

    await setTitre(fixture, 'Suites numériques');
    expect(submitButton(fixture).disabled).toBe(false);
  });

  it('filtre le picker de niveaux par le système scolaire du profil', async () => {
    const fixture = await createComponent();
    const picker = fixture.debugElement.query(By.directive(EducationLevelPicker))
      .componentInstance as EducationLevelPicker;

    expect(profilesMock.ensureLoaded).toHaveBeenCalled();
    expect(picker.systeme()).toBe(USER_PROFILE_ONBOARDED_FIXTURE.systeme_scolaire);
  });

  it('crée le cours puis file vers son espace blocs', async () => {
    const fixture = await createComponent();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await setTitre(fixture, '  Suites numériques  ');
    await submit(fixture);

    expect(coursesMock.createCourse).toHaveBeenCalledWith({
      titre: 'Suites numériques',
      description: null,
      subject_ids: [],
      education_level_ids: [],
    });
    expect(navigate).toHaveBeenCalledWith(['/', 'fr', 'courses', COURSES_FIXTURE[0].id]);
  });

  it('affiche l’erreur et reste sur place si la création échoue', async () => {
    coursesMock.createCourse.mockRejectedValue(new Error('boom'));
    const fixture = await createComponent();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await setTitre(fixture, 'Suites numériques');
    await submit(fixture);

    expect(el(fixture).querySelector('.course-create__error')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
    expect(submitButton(fixture).disabled).toBe(false); // retry possible
  });
});
