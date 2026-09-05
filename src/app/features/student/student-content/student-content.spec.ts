import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  COURSE_MODULE_RESOLVER,
  COURSE_RESOURCE_RESOLVER,
} from '../../../core/course-content/course-content-resolvers';
import { PublicCourseDetail } from '../../../core/public-courses/public-course.model';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { PrintService } from '../../../shared/print/print.service';
import {
  PUBLIC_COURSE_DETAIL_FIXTURE,
  PUBLIC_COURSE_RESOURCES_FIXTURE,
} from '../../../testing/public-courses.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { StudentContent } from './student-content';

describe('StudentContent', () => {
  const detail = signal<PublicCourseDetail | null>(PUBLIC_COURSE_DETAIL_FIXTURE);
  const coursesMock = {
    detail,
    access: signal({ mode: 'public' as const, key: 'course-1' }),
    contentUrl: vi.fn().mockReturnValue('https://site.test/fr/p/courses/course-1/resources/r'),
  };
  const resolverMock = {
    list: signal(PUBLIC_COURSE_RESOURCES_FIXTURE),
    listLoading: signal(false),
    ensureList: vi.fn(),
    getDownloadUrl: vi.fn().mockResolvedValue('https://s3.test/presigned'),
    contentUrl: vi.fn(),
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
  const printMock = { printCourseContent: vi.fn().mockResolvedValue(undefined) };

  async function createComponent(): Promise<ComponentFixture<StudentContent>> {
    await TestBed.configureTestingModule({
      imports: [StudentContent, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: PublicCourseService, useValue: coursesMock },
        { provide: COURSE_RESOURCE_RESOLVER, useValue: resolverMock },
        { provide: COURSE_MODULE_RESOLVER, useValue: moduleResolverMock },
        { provide: PrintService, useValue: printMock },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StudentContent);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<StudentContent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    detail.set(PUBLIC_COURSE_DETAIL_FIXTURE);
    vi.clearAllMocks();
    printMock.printCourseContent.mockResolvedValue(undefined);
  });

  it('renders every block at once, in the back order', async () => {
    const fixture = await createComponent();

    expect(el(fixture).querySelectorAll('.course-preview__block').length).toBe(4);
  });

  it('renders exercise blocks read-only, with a CTA to the block where they are solved', async () => {
    const fixture = await createComponent();

    expect(el(fixture).querySelectorAll('.exercise-view__question-title').length).toBe(1);
    expect(el(fixture).querySelector('textarea')).toBeNull();
    expect(
      el(fixture)
        .querySelector<HTMLAnchorElement>('.course-preview__exercise-cta a')
        ?.getAttribute('href'),
    ).toBe('/fr/p/courses/course-1/blocks/block-3');
  });

  it('prints the rendered container with the public URL builder', async () => {
    const fixture = await createComponent();
    el(fixture).querySelector<HTMLButtonElement>('.student-content__actions .btn')!.click();
    await fixture.whenStable();

    expect(printMock.printCourseContent).toHaveBeenCalledTimes(1);
    const [source, courseId, urlBuilder] = printMock.printCourseContent.mock.calls[0];
    expect((source as HTMLElement).querySelectorAll('.course-preview__block').length).toBe(4);
    expect(courseId).toBe('course-1');
    // Le builder doit passer par le régime PUBLIC (liens du PDF consultables sans compte).
    (urlBuilder as (l: string, c: string, r: string) => string)('fr', 'course-1', 'resource-1');
    expect(coursesMock.contentUrl).toHaveBeenCalledWith('fr', 'course-1', 'resource-1');
  });

  it('shows the empty notice — and no PDF button — when the course has no block', async () => {
    detail.set({ ...PUBLIC_COURSE_DETAIL_FIXTURE, blocks: [] });
    const fixture = await createComponent();

    expect(el(fixture).querySelector('.student-content__notice')).not.toBeNull();
    expect(el(fixture).querySelector('.student-content__actions')).toBeNull();
  });
});
