import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { PublicCourseDetail } from '../../../core/public-courses/public-course.model';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { PUBLIC_COURSE_DETAIL_FIXTURE } from '../../../testing/public-courses.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { StudentCourse } from './student-course';

/** Panneaux factices : la coquille est testée pour sa nav, pas pour eux. */
@Component({ selector: 'app-stub-summary', template: '<p class="stub">summary</p>' })
class StubSummary {}
@Component({ selector: 'app-stub-blocks', template: '<p class="stub">block</p>' })
class StubBlock {}
@Component({ selector: 'app-stub-resources', template: '<p class="stub">resources</p>' })
class StubResources {}
@Component({ selector: 'app-stub-modules', template: '<p class="stub">modules</p>' })
class StubModules {}
@Component({ selector: 'app-stub-content', template: '<p class="stub">content</p>' })
class StubContent {}

describe('StudentCourse (coquille à onglets)', () => {
  const detail = signal<PublicCourseDetail | null>(PUBLIC_COURSE_DETAIL_FIXTURE);
  const detailLoading = signal(false);
  const detailError = signal(false);
  const coursesMock = {
    detail,
    detailLoading,
    detailError,
    access: signal({ mode: 'public' as const, key: 'course-1' }),
    loadCourse: vi.fn().mockResolvedValue(PUBLIC_COURSE_DETAIL_FIXTURE),
    contentUrl: vi.fn(),
  };

  /** Monte l'arbre de routes réel (la coquille + ses onglets) sur `url`. */
  async function navigate(url: string): Promise<RouterTestingHarness> {
    TestBed.configureTestingModule({
      providers: [
        provideTranslocoTesting().providers ?? [],
        provideRouter([
          {
            path: ':lang/p/courses/:courseId',
            data: { access: 'public' },
            children: [
              {
                path: '',
                component: StudentCourse,
                children: [
                  { path: '', pathMatch: 'full', component: StubSummary },
                  { path: 'blocks/:blockId', component: StubBlock },
                  { path: 'resources', component: StubResources },
                  { path: 'modules', component: StubModules },
                  { path: 'content', component: StubContent },
                ],
              },
            ],
          },
        ]),
        { provide: PublicCourseService, useValue: coursesMock },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  function el(harness: RouterTestingHarness): HTMLElement {
    return harness.routeNativeElement!.ownerDocument.body;
  }

  function tabs(harness: RouterTestingHarness): HTMLAnchorElement[] {
    return Array.from(el(harness).querySelectorAll('.student-course__tabbar .tab'));
  }

  function activeTab(harness: RouterTestingHarness): string | undefined {
    return el(harness).querySelector('.tab--active')?.textContent?.trim();
  }

  beforeEach(() => {
    detail.set(PUBLIC_COURSE_DETAIL_FIXTURE);
    detailLoading.set(false);
    detailError.set(false);
    vi.clearAllMocks();
  });

  it('loads the course from the route access and shows its header', async () => {
    const harness = await navigate('/fr/p/courses/course-1');

    expect(coursesMock.loadCourse).toHaveBeenCalledWith({ mode: 'public', key: 'course-1' });
    expect(el(harness).querySelector('.student-course__title')?.textContent).toContain(
      'Suites numériques',
    );
    const chips = Array.from(el(harness).querySelectorAll('.student-course__chip')).map((c) =>
      c.textContent?.trim(),
    );
    expect(chips).toEqual(['Mathématiques', '6e']);
  });

  it('links every tab to its own route in the current access regime', async () => {
    const harness = await navigate('/fr/p/courses/course-1');
    const hrefs = tabs(harness).map((a) => a.getAttribute('href'));

    expect(hrefs).toEqual([
      '/fr/p/courses/course-1',
      '/fr/p/courses/course-1/resources',
      '/fr/p/courses/course-1/modules',
      '/fr/p/courses/course-1/content',
    ]);
  });

  it('lands on the summary tab and renders its route', async () => {
    const harness = await navigate('/fr/p/courses/course-1');

    expect(activeTab(harness)).toBe('Sommaire');
    expect(el(harness).querySelector('.stub')?.textContent).toBe('summary');
  });

  it.each([
    ['/fr/p/courses/course-1/resources', 'Ressources', 'resources'],
    ['/fr/p/courses/course-1/modules', 'Modules', 'modules'],
    ['/fr/p/courses/course-1/content', 'Cours entier', 'content'],
  ])('marks the tab of %s active', async (url, label, panel) => {
    const harness = await navigate(url);

    expect(activeTab(harness)).toBe(label);
    expect(el(harness).querySelector('.stub')?.textContent).toBe(panel);
  });

  it('keeps the summary tab active while a single block is open', async () => {
    const harness = await navigate('/fr/p/courses/course-1/blocks/block-1');

    expect(activeTab(harness)).toBe('Sommaire');
    expect(el(harness).querySelector('.stub')?.textContent).toBe('block');
  });

  it('follows the active tab when navigating without remounting the shell', async () => {
    const harness = await navigate('/fr/p/courses/course-1');
    expect(activeTab(harness)).toBe('Sommaire');

    await TestBed.inject(Router).navigateByUrl('/fr/p/courses/course-1/modules');
    harness.detectChanges();

    // La coquille survit au changement d'onglet : `activeTab` doit malgré tout
    // suivre (relecture de firstChild déclenchée par NavigationEnd).
    expect(activeTab(harness)).toBe('Modules');
    // Le cours n'est pas rechargé pour autant.
    expect(coursesMock.loadCourse).toHaveBeenCalledTimes(1);
  });

  it('shows the generic notice on error, without the tab bar', async () => {
    detailError.set(true);
    const harness = await navigate('/fr/p/courses/course-1');

    expect(el(harness).querySelector('.student-course__notice')?.textContent).toContain(
      'plus valide',
    );
    expect(el(harness).querySelector('.student-course__tabbar')).toBeNull();
  });
});
