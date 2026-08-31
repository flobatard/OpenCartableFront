import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { COURSE_MODULE_RESOLVER } from '../../../core/course-content/course-content-resolvers';
import { PublicCourseDetail } from '../../../core/public-courses/public-course.model';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { PUBLIC_COURSE_DETAIL_FIXTURE } from '../../../testing/public-courses.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { StudentModule } from './student-module';

describe('StudentModule (page dédiée)', () => {
  const detail = signal<PublicCourseDetail | null>(PUBLIC_COURSE_DETAIL_FIXTURE);
  const detailLoading = signal(false);
  const detailError = signal(false);
  const coursesMock = {
    detail,
    detailLoading,
    detailError,
    loadCourse: vi.fn().mockResolvedValue(PUBLIC_COURSE_DETAIL_FIXTURE),
  };
  const moduleResolverMock = {
    getModule: vi.fn().mockResolvedValue({
      id: 'module-1',
      title: 'Quiz interactif',
      html: '<p>Salut</p>',
      css: '',
      js: '',
      created_at: '',
      updated_at: '',
    }),
  };

  async function createComponent(
    moduleId: string,
    access: 'public' | 'token' = 'public',
  ): Promise<ComponentFixture<StudentModule>> {
    await TestBed.configureTestingModule({
      imports: [StudentModule, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: PublicCourseService, useValue: coursesMock },
        { provide: COURSE_MODULE_RESOLVER, useValue: moduleResolverMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { access },
              paramMap: convertToParamMap(
                access === 'public'
                  ? { courseId: 'course-1', moduleId }
                  : { token: 'tok-42', moduleId },
              ),
            },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StudentModule);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<StudentModule>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    detail.set(PUBLIC_COURSE_DETAIL_FIXTURE);
    detailLoading.set(false);
    detailError.set(false);
    vi.clearAllMocks();
  });

  it('loads the course itself and runs the requested module alone', async () => {
    const fixture = await createComponent('module-1');

    expect(coursesMock.loadCourse).toHaveBeenCalledWith({ mode: 'public', key: 'course-1' });
    expect(el(fixture).querySelector('.student-module__title')?.textContent).toContain(
      'Quiz interactif',
    );
    expect(el(fixture).querySelectorAll('app-module-embed').length).toBe(1);
    expect(moduleResolverMock.getModule).toHaveBeenCalledWith('course-1', 'module-1');
    // Page de démonstration : ni en-tête de cours, ni onglets.
    expect(el(fixture).querySelector('.student-course__tabbar')).toBeNull();
  });

  it('links back to the modules tab of the current access regime', async () => {
    const fixture = await createComponent('module-1');

    expect(
      el(fixture).querySelector<HTMLAnchorElement>('.student-module__back')?.getAttribute('href'),
    ).toBe('/fr/p/courses/course-1/modules');
  });

  it('works the same behind a share link', async () => {
    const fixture = await createComponent('module-1', 'token');

    expect(coursesMock.loadCourse).toHaveBeenCalledWith({ mode: 'token', key: 'tok-42' });
    expect(
      el(fixture).querySelector<HTMLAnchorElement>('.student-module__back')?.getAttribute('href'),
    ).toBe('/fr/shared/tok-42/modules');
  });

  it('shows a notice when the module is not in the course library', async () => {
    const fixture = await createComponent('module-inconnu');

    expect(el(fixture).querySelector('.student-module__notice')?.textContent).toContain(
      'Ce module',
    );
    expect(el(fixture).querySelector('app-module-embed')).toBeNull();
  });

  it('shows the generic course notice when the course itself is refused', async () => {
    detailError.set(true);
    const fixture = await createComponent('module-1');

    expect(el(fixture).querySelector('.student-module__notice')?.textContent).toContain(
      'plus valide',
    );
  });
});
