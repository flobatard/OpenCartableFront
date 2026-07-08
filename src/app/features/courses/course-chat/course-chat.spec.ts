import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CourseChat } from './course-chat';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';

describe('CourseChat', () => {
  async function createComponent(): Promise<ComponentFixture<CourseChat>> {
    await TestBed.configureTestingModule({
      imports: [CourseChat, provideTranslocoTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseChat);
    // input.required : poser les inputs AVANT le premier detectChanges.
    fixture.componentRef.setInput('courseId', 'course-1');
    fixture.componentRef.setInput('blockId', 'block-1');
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: ComponentFixture<CourseChat>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('rend l’en-tête, l’état vide et une saisie désactivée', async () => {
    const fixture = await createComponent();

    expect(el(fixture).querySelector('.course-chat__title')?.textContent).toContain('Assistant');
    expect(el(fixture).querySelector('.course-chat__empty')).toBeTruthy();

    const textarea = el(fixture).querySelector<HTMLTextAreaElement>('.course-chat__input');
    expect(textarea?.disabled).toBe(true);
    expect(el(fixture).querySelector<HTMLButtonElement>('.course-chat__send')?.disabled).toBe(true);
  });

  it('émet collapse au clic sur le bouton de repli', async () => {
    const fixture = await createComponent();
    const spy = vi.fn();
    fixture.componentInstance.collapse.subscribe(spy);

    el(fixture).querySelector<HTMLButtonElement>('.course-chat__collapse')?.click();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
