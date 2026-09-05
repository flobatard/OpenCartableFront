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
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { USER_PROFILE_ONBOARDED_FIXTURE } from '../../../testing/user-profile.fixture';
import { mockEducationLevelService, mockSubjectService } from '../../../testing/service-mocks';

describe('CourseCreate', () => {
  const coursesMock = { createCourse: vi.fn() };
  const profilesMock = { ensureLoaded: vi.fn() };
  const subjectsMock = mockSubjectService();
  const levelsMock = mockEducationLevelService();

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
    const input = el(fixture).querySelector<HTMLInputElement>('#course-title')!;
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

  it('disables creation while the title is blank', async () => {
    const fixture = await createComponent();
    expect(submitButton(fixture).disabled).toBe(true);

    await setTitre(fixture, '   ');
    expect(submitButton(fixture).disabled).toBe(true);

    await setTitre(fixture, 'Suites numériques');
    expect(submitButton(fixture).disabled).toBe(false);
  });

  it('filters the level picker by the profile’s school system', async () => {
    const fixture = await createComponent();
    const picker = fixture.debugElement.query(By.directive(EducationLevelPicker))
      .componentInstance as EducationLevelPicker;

    expect(profilesMock.ensureLoaded).toHaveBeenCalled();
    expect(picker.system()).toBe(USER_PROFILE_ONBOARDED_FIXTURE.school_system);
  });

  it('creates the course then goes to its blocks workspace', async () => {
    const fixture = await createComponent();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await setTitre(fixture, '  Suites numériques  ');
    await submit(fixture);

    expect(coursesMock.createCourse).toHaveBeenCalledWith({
      title: 'Suites numériques',
      description: null,
      subject_ids: [],
      education_level_ids: [],
    });
    expect(navigate).toHaveBeenCalledWith(['/', 'fr', 'courses', COURSES_FIXTURE[0].id]);
  });

  it('shows the error and stays put when creation fails', async () => {
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
