import { ComponentFixture, TestBed } from '@angular/core/testing';
import { COURSE_MODULE_RESOLVER } from '../../core/course-content/course-content-resolvers';
import { ModuleDetail } from '../../core/modules/module.model';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { ModuleEmbed } from './module-embed';

const MODULE: ModuleDetail = {
  id: 'module-1',
  title: 'Grapheur',
  html: '<p>Salut</p>',
  css: '',
  js: '',
  created_at: '',
  updated_at: '',
};

describe('ModuleEmbed', () => {
  let fixture: ComponentFixture<ModuleEmbed>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModuleEmbed, provideTranslocoTesting()],
      providers: [
        { provide: COURSE_MODULE_RESOLVER, useValue: { getModule: vi.fn().mockResolvedValue(MODULE) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ModuleEmbed);
    fixture.componentRef.setInput('courseId', 'course-1');
    fixture.componentRef.setInput('moduleId', 'module-1');
    await fixture.whenStable();
  });

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const frame = (): HTMLElement => el().querySelector<HTMLElement>('.module-embed__frame')!;
  const toggle = (): HTMLButtonElement =>
    el().querySelector<HTMLButtonElement>('.module-embed__expand')!;

  it('expands the frame into a full-screen layer without re-creating the iframe', async () => {
    const iframe = el().querySelector('iframe');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(toggle().textContent).toContain('Agrandir');

    toggle().click();
    await fixture.whenStable();

    expect(frame().classList).toContain('module-embed__frame--expanded');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(toggle().textContent).toContain('Réduire');
    // Même nœud : le module garde son état.
    expect(el().querySelector('iframe')).toBe(iframe);
  });

  it('collapses on Escape and gives focus back to the toggle', async () => {
    toggle().click();
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(frame().classList).not.toContain('module-embed__frame--expanded');
    expect(document.activeElement).toBe(toggle());
  });
});
