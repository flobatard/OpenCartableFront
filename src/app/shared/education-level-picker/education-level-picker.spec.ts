import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EducationLevelPicker } from './education-level-picker';
import { EducationLevelService } from '../../core/education-levels/education-level.service';
import {
  EDUCATION_LEVELS_FIXTURE,
  EDUCATION_LEVELS_MULTI_SYSTEM_FIXTURE,
} from '../../testing/education-levels.fixture';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('EducationLevelPicker', () => {
  const tree = signal(EDUCATION_LEVELS_FIXTURE);
  const levelsMock = {
    tree,
    loading: signal(false),
    error: signal(false),
    load: vi.fn(),
    reload: vi.fn(),
    tree$: vi.fn(),
  };

  async function createComponent(): Promise<ComponentFixture<EducationLevelPicker>> {
    await TestBed.configureTestingModule({
      imports: [EducationLevelPicker, provideTranslocoTesting()],
      providers: [{ provide: EducationLevelService, useValue: levelsMock }],
    }).compileComponents();
    const fixture = TestBed.createComponent(EducationLevelPicker);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<EducationLevelPicker>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function openPanel(fixture: ComponentFixture<EducationLevelPicker>): Promise<void> {
    el(fixture).querySelector<HTMLButtonElement>('.education-level-picker__field')?.click();
    await fixture.whenStable();
  }

  function checkboxes(fixture: ComponentFixture<EducationLevelPicker>): HTMLInputElement[] {
    return [...el(fixture).querySelectorAll<HTMLInputElement>('.education-level-picker__checkbox')];
  }

  function chipNames(fixture: ComponentFixture<EducationLevelPicker>): string[] {
    return [...el(fixture).querySelectorAll('.education-level-picker__chip-name')].map(
      (c) => c.textContent?.trim() ?? '',
    );
  }

  beforeEach(() => {
    tree.set(EDUCATION_LEVELS_FIXTURE);
    vi.clearAllMocks();
  });

  it('loads the tree on startup', async () => {
    await createComponent();
    expect(levelsMock.load).toHaveBeenCalled();
  });

  it('writeValue shows the chips in tree order and the summary, without emitting', async () => {
    const fixture = await createComponent();
    const changes: string[][] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));
    fixture.componentInstance.writeValue(['superieur-doctorat', 'college-6e']);
    await fixture.whenStable();

    expect(chipNames(fixture)).toEqual(['6e', 'Doctorat']);
    const text = el(fixture).querySelector('.education-level-picker__text');
    expect(text?.textContent).toContain('2');
    expect(changes).toEqual([]);
  });

  it('checking a box emits an array ordered by the tree', async () => {
    const fixture = await createComponent();
    const changes: string[][] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));

    await openPanel(fixture);
    // Lignes en parcours préfixe : Collège, 6e, 5e, Supérieur, Doctorat.
    checkboxes(fixture)[1].click(); // 6e
    await fixture.whenStable();
    checkboxes(fixture)[0].click(); // Collège — doit passer devant dans la valeur
    await fixture.whenStable();

    expect(changes).toEqual([['college-6e'], ['college', 'college-6e']]);
  });

  it('checking a cycle does not cascade to its grades', async () => {
    const fixture = await createComponent();
    const changes: string[][] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));

    await openPanel(fixture);
    checkboxes(fixture)[0].click(); // Collège
    await fixture.whenStable();

    expect(changes).toEqual([['college']]);
    expect(checkboxes(fixture)[1].checked).toBe(false); // 6e
    expect(checkboxes(fixture)[2].checked).toBe(false); // 5e
  });

  it('unchecking a box removes the id from the value', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.writeValue(['college-6e']);
    const changes: string[][] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));

    await openPanel(fixture);
    const sixieme = checkboxes(fixture)[1];
    expect(sixieme.checked).toBe(true);
    sixieme.click();
    await fixture.whenStable();

    expect(changes).toEqual([[]]);
    expect(chipNames(fixture)).toEqual([]);
  });

  it('a chip’s button removes the selection', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.writeValue(['college-6e']);
    const changes: string[][] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));
    await fixture.whenStable();

    el(fixture).querySelector<HTMLButtonElement>('.education-level-picker__chip')?.click();
    await fixture.whenStable();

    expect(changes).toEqual([[]]);
    expect(chipNames(fixture)).toEqual([]);
  });

  it('setDisabledState disables the field and the chips, and closes the panel', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.writeValue(['college-6e']);
    await openPanel(fixture);

    fixture.componentInstance.setDisabledState(true);
    await fixture.whenStable();

    expect(el(fixture).querySelector('.education-level-picker__panel')).toBeNull();
    expect(
      el(fixture).querySelector<HTMLButtonElement>('.education-level-picker__field')?.disabled,
    ).toBe(true);
    expect(
      el(fixture).querySelector<HTMLButtonElement>('.education-level-picker__chip')?.disabled,
    ).toBe(true);
  });

  it('writeValue(null) clears the selection', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.writeValue(['college-6e']);
    await fixture.whenStable();
    expect(chipNames(fixture)).toEqual(['6e']);

    fixture.componentInstance.writeValue(null);
    await fixture.whenStable();
    expect(chipNames(fixture)).toEqual([]);
  });

  it('an unknown id has no chip but is preserved in the next emission', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.writeValue(['fantome']);
    const changes: string[][] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));
    await fixture.whenStable();

    expect(chipNames(fixture)).toEqual([]);

    await openPanel(fixture);
    checkboxes(fixture)[1].click(); // 6e
    await fixture.whenStable();

    // Ids connus en ordre d'arbre, inconnus préservés en fin.
    expect(changes).toEqual([['college-6e', 'fantome']]);
  });

  it('Escape closes the panel', async () => {
    const fixture = await createComponent();
    await openPanel(fixture);
    expect(el(fixture).querySelector('.education-level-picker__panel')).not.toBeNull();

    checkboxes(fixture)[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await fixture.whenStable();

    expect(el(fixture).querySelector('.education-level-picker__panel')).toBeNull();
  });

  it('filters roots by school system via the system input', async () => {
    tree.set(EDUCATION_LEVELS_MULTI_SYSTEM_FIXTURE);
    const fixture = await createComponent();
    fixture.componentRef.setInput('system', 'uk');
    await openPanel(fixture);

    const labels = [
      ...el(fixture).querySelectorAll('.education-level-picker__label'),
    ].map((l) => l.textContent?.trim());
    expect(labels).toEqual(['Secondary school', 'Year 7']);
  });

  it('without a system input, all systems are shown', async () => {
    tree.set(EDUCATION_LEVELS_MULTI_SYSTEM_FIXTURE);
    const fixture = await createComponent();
    await openPanel(fixture);

    expect(checkboxes(fixture)).toHaveLength(7); // 5 fr + 2 uk
  });

  it('shows the empty state when the tree is empty', async () => {
    tree.set([]);
    const fixture = await createComponent();
    await openPanel(fixture);

    expect(el(fixture).querySelector('.education-level-picker__empty')).not.toBeNull();
  });
});
