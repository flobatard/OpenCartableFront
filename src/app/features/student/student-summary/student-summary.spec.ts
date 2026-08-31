import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PublicCourseDetail } from '../../../core/public-courses/public-course.model';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { PUBLIC_COURSE_DETAIL_FIXTURE } from '../../../testing/public-courses.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { StudentSummary } from './student-summary';

describe('StudentSummary', () => {
  const detail = signal<PublicCourseDetail | null>(PUBLIC_COURSE_DETAIL_FIXTURE);
  const coursesMock = {
    detail,
    access: signal({ mode: 'public' as const, key: 'course-1' }),
  };

  async function createComponent(): Promise<ComponentFixture<StudentSummary>> {
    await TestBed.configureTestingModule({
      imports: [StudentSummary, provideTranslocoTesting()],
      providers: [provideRouter([]), { provide: PublicCourseService, useValue: coursesMock }],
    }).compileComponents();
    const fixture = TestBed.createComponent(StudentSummary);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<StudentSummary>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    detail.set(PUBLIC_COURSE_DETAIL_FIXTURE);
    coursesMock.access.set({ mode: 'public', key: 'course-1' });
  });

  it('lists every block in the back order, falling back on a numbered title', async () => {
    const fixture = await createComponent();
    const titles = Array.from(el(fixture).querySelectorAll('.student-summary__title')).map((t) =>
      t.textContent?.trim(),
    );

    expect(titles).toEqual([
      'Le concept de suite',
      'Partie 2',
      'Exercices d’application',
      'Grapheur',
    ]);
  });

  it('shows the type badge and the description of each block', async () => {
    const fixture = await createComponent();
    const types = Array.from(el(fixture).querySelectorAll('.student-summary__type')).map((t) =>
      t.textContent?.trim(),
    );
    const descs = Array.from(el(fixture).querySelectorAll('.student-summary__desc')).map((d) =>
      d.textContent?.trim(),
    );

    expect(types).toEqual(['Texte', 'Document', 'Exercice', 'Interactif']);
    // Seul le premier bloc de la fixture porte une description.
    expect(descs).toEqual(['Définitions et premiers exemples.']);
  });

  it('links each entry to the block page of the current access regime', async () => {
    const fixture = await createComponent();
    const hrefs = Array.from(
      el(fixture).querySelectorAll<HTMLAnchorElement>('.student-summary__link'),
    ).map((a) => a.getAttribute('href'));

    expect(hrefs[0]).toBe('/fr/p/courses/course-1/blocks/block-1');
  });

  it('builds share-link URLs when the access regime is a token', async () => {
    coursesMock.access.set({ mode: 'token', key: 'tok-42' } as never);
    const fixture = await createComponent();
    const href = el(fixture)
      .querySelector<HTMLAnchorElement>('.student-summary__link')
      ?.getAttribute('href');

    expect(href).toBe('/fr/shared/tok-42/blocks/block-1');
  });

  it('shows the empty notice when the course has no block', async () => {
    detail.set({ ...PUBLIC_COURSE_DETAIL_FIXTURE, blocks: [] });
    const fixture = await createComponent();

    expect(el(fixture).querySelector('.student-summary__notice')).not.toBeNull();
  });
});
