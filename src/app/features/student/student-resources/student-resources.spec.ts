import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { COURSE_RESOURCE_RESOLVER } from '../../../core/course-content/course-content-resolvers';
import { CourseResource } from '../../../core/resources/resource.model';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import {
  PUBLIC_COURSE_DETAIL_FIXTURE,
  PUBLIC_COURSE_RESOURCES_FIXTURE,
} from '../../../testing/public-courses.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { StudentResources } from './student-resources';

/** Une image s'ajoute au PDF de la fixture : seuls ces deux types sont prévisualisables. */
const RESOURCES: CourseResource[] = [
  ...PUBLIC_COURSE_RESOURCES_FIXTURE,
  {
    id: 'resource-2',
    type: 'image',
    original_name: 'illustration.png',
    size: 1_800_000,
    mime: 'image/png',
    status: 'available',
    created_at: '',
    updated_at: '',
  },
  {
    id: 'resource-3',
    type: 'audio',
    original_name: 'capsule.mp3',
    size: 3_000_000,
    mime: 'audio/mpeg',
    status: 'available',
    created_at: '',
    updated_at: '',
  },
];

describe('StudentResources', () => {
  const coursesMock = { detail: signal(PUBLIC_COURSE_DETAIL_FIXTURE) };
  const resolverMock = {
    list: signal(RESOURCES),
    listLoading: signal(false),
    ensureList: vi.fn(),
    getDownloadUrl: vi.fn().mockResolvedValue('https://s3.test/presigned'),
    contentUrl: vi.fn(),
  };

  async function createComponent(
    resources: readonly CourseResource[] = RESOURCES,
  ): Promise<ComponentFixture<StudentResources>> {
    resolverMock.list.set(resources as CourseResource[]);
    await TestBed.configureTestingModule({
      imports: [StudentResources, provideTranslocoTesting()],
      providers: [
        { provide: COURSE_RESOURCE_RESOLVER, useValue: resolverMock },
        { provide: PublicCourseService, useValue: coursesMock },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StudentResources);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<StudentResources>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(fixture: ComponentFixture<StudentResources>): HTMLElement[] {
    return Array.from(el(fixture).querySelectorAll('.student-resources__row'));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    coursesMock.detail.set(PUBLIC_COURSE_DETAIL_FIXTURE);
    resolverMock.getDownloadUrl.mockResolvedValue('https://s3.test/presigned');
  });

  it('lists every resource with its type badge and size', async () => {
    const fixture = await createComponent();
    const types = rows(fixture).map((r) =>
      r.querySelector('.student-resources__type')?.textContent?.trim(),
    );
    const sizes = rows(fixture).map((r) =>
      r.querySelector('.student-resources__meta')?.textContent?.trim(),
    );

    // Le PDF a son badge dédié parmi les documents (resourceTypeLabelKey).
    expect(types).toEqual(['PDF', 'Image', 'Audio']);
    expect(sizes[0]).toBe('245,0 ko');
  });

  it('offers a preview only on images and PDFs', async () => {
    const fixture = await createComponent();
    const labels = rows(fixture).map((r) =>
      Array.from(r.querySelectorAll('.btn')).map((b) => b.textContent?.trim()),
    );

    expect(labels[0]).toEqual(['Voir', 'Télécharger']);
    expect(labels[1]).toEqual(['Voir', 'Télécharger']);
    expect(labels[2]).toEqual(['Télécharger']);
  });

  it('presigns through the resolver and opens the file in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const fixture = await createComponent();
    rows(fixture)[2].querySelector<HTMLButtonElement>('.btn')!.click();
    await fixture.whenStable();

    expect(resolverMock.getDownloadUrl).toHaveBeenCalledWith('course-1', 'resource-3');
    expect(open).toHaveBeenCalledWith('https://s3.test/presigned', '_blank', 'noopener');
    open.mockRestore();
  });

  it('reports a failed presign without breaking the list', async () => {
    resolverMock.getDownloadUrl.mockRejectedValue(new Error('boom'));
    const fixture = await createComponent();
    rows(fixture)[2].querySelector<HTMLButtonElement>('.btn')!.click();
    await fixture.whenStable();

    expect(el(fixture).querySelector('.student-resources__error')).not.toBeNull();
    expect(rows(fixture).length).toBe(3);
  });

  it('shows an empty notice when the course has no resource', async () => {
    const fixture = await createComponent([]);

    expect(el(fixture).querySelector('.student-resources__empty')?.textContent).toContain(
      'aucun fichier',
    );
  });
});
