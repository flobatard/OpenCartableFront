import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PublicModuleSummary } from '../../../core/public-courses/public-course.model';
import { PublicModuleResolver } from '../../../core/public-courses/public-content-resolvers';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { StudentModules } from './student-modules';

const MODULES: PublicModuleSummary[] = [
  { id: 'module-1', title: 'Quiz interactif' },
  { id: 'module-2', title: 'Grapheur' },
];

describe('StudentModules', () => {
  const coursesMock = { access: signal({ mode: 'public' as const, key: 'course-1' }) };
  const moduleResolverMock = { list: signal<readonly PublicModuleSummary[]>(MODULES) };

  async function createComponent(
    modules: readonly PublicModuleSummary[] = MODULES,
  ): Promise<ComponentFixture<StudentModules>> {
    moduleResolverMock.list.set(modules);
    await TestBed.configureTestingModule({
      imports: [StudentModules, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: PublicCourseService, useValue: coursesMock },
        { provide: PublicModuleResolver, useValue: moduleResolverMock },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StudentModules);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<StudentModules>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function links(fixture: ComponentFixture<StudentModules>): HTMLAnchorElement[] {
    return Array.from(el(fixture).querySelectorAll('.student-modules__link'));
  }

  beforeEach(() => coursesMock.access.set({ mode: 'public', key: 'course-1' }));

  it('lists the course module library by title', async () => {
    const fixture = await createComponent();
    const titles = links(fixture).map((a) =>
      a.querySelector('.student-modules__title')?.textContent?.trim(),
    );

    expect(titles).toEqual(['Quiz interactif', 'Grapheur']);
  });

  it('links each module to its dedicated page and mounts no iframe', async () => {
    const fixture = await createComponent();

    expect(links(fixture).map((a) => a.getAttribute('href'))).toEqual([
      '/fr/p/courses/course-1/modules/module-1',
      '/fr/p/courses/course-1/modules/module-2',
    ]);
    // L'onglet est un index : aucun module n'est exécuté tant qu'on n'en ouvre pas un.
    expect(el(fixture).querySelector('app-module-embed')).toBeNull();
  });

  it('builds share-link URLs when the access regime is a token', async () => {
    coursesMock.access.set({ mode: 'token', key: 'tok-42' } as never);
    const fixture = await createComponent();

    expect(links(fixture)[0].getAttribute('href')).toBe('/fr/shared/tok-42/modules/module-1');
  });

  it('shows an empty notice when the course has no module', async () => {
    const fixture = await createComponent([]);

    expect(el(fixture).querySelector('.student-modules__empty')?.textContent).toContain(
      'aucun module',
    );
  });
});
