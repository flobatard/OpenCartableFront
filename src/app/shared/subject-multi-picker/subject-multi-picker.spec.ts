import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SubjectMultiPicker } from './subject-multi-picker';
import { SubjectService } from '../../core/subjects/subject.service';
import { SUBJECTS_FIXTURE } from '../../testing/subjects.fixture';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('SubjectMultiPicker', () => {
  const tree = signal(SUBJECTS_FIXTURE);
  const subjectsMock = {
    tree,
    loading: signal(false),
    error: signal(false),
    load: vi.fn(),
    reload: vi.fn(),
    tree$: vi.fn(),
  };

  async function createComponent(): Promise<ComponentFixture<SubjectMultiPicker>> {
    await TestBed.configureTestingModule({
      imports: [SubjectMultiPicker, provideTranslocoTesting()],
      providers: [{ provide: SubjectService, useValue: subjectsMock }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SubjectMultiPicker);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<SubjectMultiPicker>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function chipNames(fixture: ComponentFixture<SubjectMultiPicker>): string[] {
    return [...el(fixture).querySelectorAll('.subject-multi-picker__chip-name')].map(
      (c) => c.textContent?.trim() ?? '',
    );
  }

  /** Sélectionne une matière via le picker interne (recherche + clic). */
  async function pickBySearch(
    fixture: ComponentFixture<SubjectMultiPicker>,
    term: string,
  ): Promise<void> {
    el(fixture).querySelector<HTMLButtonElement>('.subject-picker__field')?.click();
    await fixture.whenStable();
    const search = el(fixture).querySelector<HTMLInputElement>('.subject-picker__search');
    search!.value = term;
    search!.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    el(fixture).querySelector<HTMLElement>('.subject-picker__option--flat')?.click();
    await fixture.whenStable();
  }

  beforeEach(() => {
    tree.set(SUBJECTS_FIXTURE);
    vi.clearAllMocks();
  });

  it('writeValue shows the chips and dedupes, without emitting', async () => {
    const fixture = await createComponent();
    const changes: string[][] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));
    fixture.componentInstance.writeValue(['math', 'francais', 'math']);
    await fixture.whenStable();

    expect(chipNames(fixture)).toEqual(['Mathématiques', 'Français']);
    expect(changes).toEqual([]);
  });

  it('selecting via the inner picker adds the subject and clears the field', async () => {
    const fixture = await createComponent();
    const changes: string[][] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));

    await pickBySearch(fixture, 'espaces');

    expect(changes).toEqual([['math-algebre-ev']]);
    expect(chipNames(fixture)).toEqual(['Espaces vectoriels']);
    // Le champ d'ajout est réinitialisé (placeholder, pas la sélection).
    const text = el(fixture).querySelector('.subject-picker__text');
    expect(text?.textContent).not.toContain('Espaces vectoriels');
  });

  it('re-selecting an already chosen subject creates no duplicate', async () => {
    const fixture = await createComponent();
    const changes: string[][] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));

    await pickBySearch(fixture, 'espaces');
    await pickBySearch(fixture, 'espaces');

    expect(changes).toEqual([['math-algebre-ev']]);
    expect(chipNames(fixture)).toEqual(['Espaces vectoriels']);
  });

  it('a chip’s button removes the subject', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.writeValue(['math', 'francais']);
    const changes: string[][] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));
    await fixture.whenStable();

    el(fixture).querySelector<HTMLButtonElement>('.subject-multi-picker__chip')?.click();
    await fixture.whenStable();

    expect(changes).toEqual([['francais']]);
    expect(chipNames(fixture)).toEqual(['Français']);
  });

  it('an unknown id has no chip but is preserved in the next emission', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.writeValue(['fantome']);
    const changes: string[][] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));
    await fixture.whenStable();

    expect(chipNames(fixture)).toEqual([]);
    await pickBySearch(fixture, 'espaces');

    expect(changes).toEqual([['fantome', 'math-algebre-ev']]);
  });

  it('setDisabledState disables the inner field and the chips', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.writeValue(['math']);
    fixture.componentInstance.setDisabledState(true);
    await fixture.whenStable();

    expect(
      el(fixture).querySelector<HTMLButtonElement>('.subject-picker__field')?.disabled,
    ).toBe(true);
    expect(
      el(fixture).querySelector<HTMLButtonElement>('.subject-multi-picker__chip')?.disabled,
    ).toBe(true);
  });
});
