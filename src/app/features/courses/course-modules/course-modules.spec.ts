import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ModuleSummary } from '../../../core/modules/module.model';
import { ModuleService } from '../../../core/modules/module.service';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { CourseModules } from './course-modules';

const MODULES: ModuleSummary[] = [
  { id: 'module-1', title: 'Quiz interactif', created_at: '2026-07-01', updated_at: '2026-07-01' },
  { id: 'module-2', title: 'Simulation', created_at: '2026-06-01', updated_at: '2026-06-01' },
];

describe('CourseModules', () => {
  const list = signal<ModuleSummary[]>(MODULES);
  const listLoading = signal(false);
  const listError = signal(false);
  const modulesMock = {
    list,
    listLoading,
    listError,
    loadList: vi.fn(),
    createModule: vi.fn(),
    renameModule: vi.fn(),
    deleteModule: vi.fn(),
  };

  async function createComponent(): Promise<ComponentFixture<CourseModules>> {
    await TestBed.configureTestingModule({
      imports: [CourseModules, provideTranslocoTesting()],
      providers: [provideRouter([]), { provide: ModuleService, useValue: modulesMock }],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseModules);
    fixture.componentRef.setInput('courseId', 'course-1');
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<CourseModules>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    list.set(MODULES);
    listLoading.set(false);
    listError.set(false);
    vi.clearAllMocks();
  });

  it('loads the library on mount and lists the modules', async () => {
    const fixture = await createComponent();
    expect(modulesMock.loadList).toHaveBeenCalledWith('course-1');
    const names = Array.from(el(fixture).querySelectorAll('.course-modules__name')).map(
      (n) => n.textContent,
    );
    expect(names).toEqual(['Quiz interactif', 'Simulation']);
    // Chaque rangée porte un lien « Modifier » vers l'éditeur du module.
    const edit = el(fixture).querySelector<HTMLAnchorElement>('.course-modules__actions a');
    expect(edit?.getAttribute('href')).toContain('/courses/course-1/modules/module-1');
  });

  it('empty state: invites to create a module', async () => {
    list.set([]);
    const fixture = await createComponent();
    expect(el(fixture).querySelector('.course-modules__empty')).toBeTruthy();
  });

  it('creates a module (trimmed title) then navigates to its editor', async () => {
    const fixture = await createComponent();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    modulesMock.createModule.mockResolvedValue({ id: 'module-9', title: 'Nouveau' });

    fixture.componentInstance.createControl.setValue('  Nouveau  ');
    el(fixture)
      .querySelector('.course-modules__create')!
      .dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(modulesMock.createModule).toHaveBeenCalledWith('course-1', { title: 'Nouveau' });
    expect(navigate).toHaveBeenCalledWith([
      '/',
      'fr',
      'courses',
      'course-1',
      'modules',
      'module-9',
    ]);
  });

  it('blank title: no creation', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.createControl.setValue('   ');
    el(fixture)
      .querySelector('.course-modules__create')!
      .dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(modulesMock.createModule).not.toHaveBeenCalled();
  });

  it('renames inline (Escape cancels)', async () => {
    const fixture = await createComponent();
    modulesMock.renameModule.mockResolvedValue({ ...MODULES[0], title: 'Quiz v2' });

    // Le 2e bouton d'action de la 1re rangée = « Renommer » (après le lien Modifier).
    el(fixture)
      .querySelectorAll<HTMLButtonElement>('.course-modules__actions button')[0]
      .click();
    fixture.detectChanges();
    const input = el(fixture).querySelector<HTMLInputElement>('.course-modules__rename-input')!;
    expect(input).toBeTruthy();
    expect(fixture.componentInstance.renameControl.value).toBe('Quiz interactif');

    // Échap referme sans enregistrer.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(el(fixture).querySelector('.course-modules__rename-input')).toBeNull();
    expect(modulesMock.renameModule).not.toHaveBeenCalled();

    // Re-ouvre et enregistre.
    el(fixture)
      .querySelectorAll<HTMLButtonElement>('.course-modules__actions button')[0]
      .click();
    fixture.detectChanges();
    fixture.componentInstance.renameControl.setValue('Quiz v2');
    el(fixture).querySelector('.course-modules__rename')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(modulesMock.renameModule).toHaveBeenCalledWith('course-1', 'module-1', 'Quiz v2');
  });

  it('deletes in two steps and emits (deleted)', async () => {
    const fixture = await createComponent();
    modulesMock.deleteModule.mockResolvedValue(undefined);
    const deleted = vi.fn();
    fixture.componentInstance.deleted.subscribe(deleted);

    const deleteBtn = () =>
      el(fixture).querySelectorAll<HTMLButtonElement>('.course-modules__delete')[0];
    deleteBtn().click(); // arme
    fixture.detectChanges();
    expect(modulesMock.deleteModule).not.toHaveBeenCalled();
    expect(deleteBtn().classList).toContain('course-modules__delete--armed');

    deleteBtn().click(); // confirme
    await fixture.whenStable();
    expect(modulesMock.deleteModule).toHaveBeenCalledWith('course-1', 'module-1');
    expect(deleted).toHaveBeenCalled();
  });

  it('leaving the armed button (blur) disarms the deletion', async () => {
    const fixture = await createComponent();
    const deleteBtn = () =>
      el(fixture).querySelectorAll<HTMLButtonElement>('.course-modules__delete')[0];
    deleteBtn().click();
    fixture.detectChanges();
    deleteBtn().dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(deleteBtn().classList).not.toContain('course-modules__delete--armed');
  });
});
