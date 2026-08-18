import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PublicCourseSummary } from '../../core/public-courses/public-course.model';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { PublicCourseCard } from './public-course-card';

const COURSE: PublicCourseSummary = {
  id: 'c1',
  titre: 'Fractions',
  description: 'Les bases',
  subjects: ['Mathématiques'],
  education_levels: ['6e'],
  block_count: 3,
  preview_settings: {},
  updated_at: '2026-07-07T12:00:00Z',
};

async function mount(course: PublicCourseSummary) {
  TestBed.configureTestingModule({
    imports: [PublicCourseCard, provideTranslocoTesting()],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(PublicCourseCard);
  fixture.componentRef.setInput('course', course);
  fixture.componentRef.setInput('link', ['/', 'fr', 'p', 'courses', course.id]);
  await fixture.whenStable();
  return fixture;
}

describe('PublicCourseCard', () => {
  it('affiche titre, description et chips (noms déjà dénormalisés)', async () => {
    const fixture = await mount(COURSE);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.public-course-card__title')?.textContent).toContain('Fractions');
    expect(el.querySelector('.public-course-card__desc')?.textContent).toContain('Les bases');
    const chips = [...el.querySelectorAll('.public-course-card__chip')].map(
      (chip) => chip.textContent?.trim(),
    );
    expect(chips).toEqual(['Mathématiques', '6e']);
  });

  it('pointe le lien fourni par l’hôte et masque les sections vides', async () => {
    const fixture = await mount({
      ...COURSE,
      description: null,
      subjects: [],
      education_levels: [],
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.public-course-card__desc')).toBeNull();
    expect(el.querySelector('.public-course-card__chips')).toBeNull();
    const open = el.querySelector<HTMLAnchorElement>('.public-course-card__open');
    expect(open?.getAttribute('href')).toBe('/fr/p/courses/c1');
  });
});
