import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { Profile } from './profile';
import { EducationLevelService } from '../../core/education-levels/education-level.service';
import { SubjectService } from '../../core/subjects/subject.service';
import { AvatarState, UserProfileService } from '../../core/users/user-profile.service';
import { UserProfile } from '../../core/users/user-profile.model';
import { AvatarCropDialog } from '../../shared/avatar-crop-dialog/avatar-crop-dialog';
import { EDUCATION_LEVELS_MULTI_SYSTEME_FIXTURE } from '../../testing/education-levels.fixture';
import { SUBJECTS_FIXTURE } from '../../testing/subjects.fixture';
import { USER_PROFILE_ALIGNED_FIXTURE } from '../../testing/user-profile.fixture';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('Profile', () => {
  const levelsMock = {
    tree: signal(EDUCATION_LEVELS_MULTI_SYSTEME_FIXTURE),
    loading: signal(false),
    error: signal(false),
    load: vi.fn(),
    reload: vi.fn(),
    tree$: vi.fn(),
  };
  const subjectsMock = {
    tree: signal(SUBJECTS_FIXTURE),
    loading: signal(false),
    error: signal(false),
    load: vi.fn(),
    reload: vi.fn(),
    tree$: vi.fn(),
  };

  let ensureLoaded: ReturnType<typeof vi.fn>;
  let saveProfile: ReturnType<typeof vi.fn>;
  let uploadAvatar: ReturnType<typeof vi.fn>;
  let deleteAvatar: ReturnType<typeof vi.fn>;
  let profileSignal: ReturnType<typeof signal<UserProfile | null>>;
  let avatarState: ReturnType<typeof signal<AvatarState>>;

  async function createComponent(): Promise<ComponentFixture<Profile>> {
    await TestBed.configureTestingModule({
      imports: [Profile, provideTranslocoTesting()],
      providers: [
        { provide: EducationLevelService, useValue: levelsMock },
        { provide: SubjectService, useValue: subjectsMock },
        {
          provide: UserProfileService,
          useValue: {
            ensureLoaded,
            saveProfile,
            uploadAvatar,
            deleteAvatar,
            profile: profileSignal.asReadonly(),
            avatarState: avatarState.asReadonly(),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Profile);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<Profile>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function roleCheckboxes(fixture: ComponentFixture<Profile>): HTMLInputElement[] {
    return [...el(fixture).querySelectorAll<HTMLInputElement>('.profile__role-checkbox')];
  }

  function saveButton(fixture: ComponentFixture<Profile>): HTMLButtonElement {
    return el(fixture).querySelector<HTMLButtonElement>('.profile__save')!;
  }

  function checkedRadioLabel(fixture: ComponentFixture<Profile>): string | undefined {
    return [...el(fixture).querySelectorAll('.profile__radio')]
      .find((r) => r.querySelector<HTMLInputElement>('input')?.checked)
      ?.textContent?.trim();
  }

  async function toggleRole(fixture: ComponentFixture<Profile>, index: 0 | 1): Promise<void> {
    roleCheckboxes(fixture)[index].click();
    await fixture.whenStable();
  }

  async function pickRadio(fixture: ComponentFixture<Profile>, label: string): Promise<void> {
    const radio = [...el(fixture).querySelectorAll('.profile__radio')].find((r) =>
      r.textContent?.includes(label),
    );
    radio?.querySelector<HTMLInputElement>('input')?.click();
    await fixture.whenStable();
  }

  beforeEach(() => {
    ensureLoaded = vi.fn().mockResolvedValue(USER_PROFILE_ALIGNED_FIXTURE);
    saveProfile = vi.fn().mockResolvedValue(USER_PROFILE_ALIGNED_FIXTURE);
    uploadAvatar = vi.fn().mockResolvedValue(USER_PROFILE_ALIGNED_FIXTURE);
    deleteAvatar = vi.fn().mockResolvedValue(USER_PROFILE_ALIGNED_FIXTURE);
    profileSignal = signal<UserProfile | null>(USER_PROFILE_ALIGNED_FIXTURE);
    avatarState = signal<AvatarState>({ phase: 'idle', progress: 0 });
    levelsMock.tree.set(EDUCATION_LEVELS_MULTI_SYSTEME_FIXTURE);
    levelsMock.error.set(false);
    vi.clearAllMocks();
  });

  it('pré-remplit rôles, système, niveaux et matières depuis le profil', async () => {
    const fixture = await createComponent();

    expect(roleCheckboxes(fixture).map((c) => c.checked)).toEqual([true, true]);
    expect(checkedRadioLabel(fixture)).toBe('France');

    const levelChips = [...el(fixture).querySelectorAll('.education-level-picker__chip-nom')].map(
      (c) => c.textContent?.trim(),
    );
    expect(levelChips).toEqual(['Collège', 'Supérieur']);

    const subjectChips = [...el(fixture).querySelectorAll('.subject-multi-picker__chip-nom')].map(
      (c) => c.textContent?.trim(),
    );
    expect(subjectChips).toEqual(['Mathématiques', 'Français']);
  });

  it('n’affiche pas la section apprentissage pour un prof seul', async () => {
    ensureLoaded.mockResolvedValue({
      ...USER_PROFILE_ALIGNED_FIXTURE,
      est_eleve: false,
      apprentissage: null,
    });
    const fixture = await createComponent();

    expect(el(fixture).textContent).toContain('Mon enseignement');
    expect(el(fixture).textContent).not.toContain('Mon apprentissage');
  });

  it('affiche l’erreur de chargement et recharge via réessayer', async () => {
    ensureLoaded.mockRejectedValue(new Error('down'));
    const fixture = await createComponent();

    expect(el(fixture).querySelector('.profile__error')).not.toBeNull();

    ensureLoaded.mockResolvedValue(USER_PROFILE_ALIGNED_FIXTURE);
    el(fixture).querySelector<HTMLButtonElement>('.btn--secondary')!.click();
    await fixture.whenStable();

    expect(el(fixture).querySelector('.profile__form')).not.toBeNull();
  });

  it('Enregistrer est désactivé sans modification, activé après une modification', async () => {
    const fixture = await createComponent();
    expect(saveButton(fixture).disabled).toBe(true);

    await toggleRole(fixture, 1); // décoche « J'apprends » — profil toujours complet
    expect(saveButton(fixture).disabled).toBe(false);
  });

  it('Enregistrer est désactivé si le profil devient incomplet', async () => {
    const fixture = await createComponent();

    await toggleRole(fixture, 0);
    await toggleRole(fixture, 1); // plus aucun rôle

    expect(saveButton(fixture).disabled).toBe(true);
  });

  it('décocher un rôle masque sa section et vide son bloc', async () => {
    const fixture = await createComponent();

    await toggleRole(fixture, 1);

    expect(el(fixture).textContent).not.toContain('Mon apprentissage');
    // Recocher : le bloc repart vide (sélections perdues, comportement voulu).
    await toggleRole(fixture, 1);
    const chips = [...el(fixture).querySelectorAll('.subject-multi-picker__chip-nom')].map(
      (c) => c.textContent?.trim(),
    );
    expect(chips).toEqual(['Mathématiques']); // seul le bloc enseignement en a encore
  });

  it('changer de système vide les niveaux, conserve les matières', async () => {
    const fixture = await createComponent();

    await pickRadio(fixture, 'Royaume-Uni');

    expect(el(fixture).querySelectorAll('.education-level-picker__chip-nom')).toHaveLength(0);
    const subjectChips = [...el(fixture).querySelectorAll('.subject-multi-picker__chip-nom')].map(
      (c) => c.textContent?.trim(),
    );
    expect(subjectChips).toEqual(['Mathématiques', 'Français']);
  });

  it('enregistre le payload exact, affiche le succès et re-désactive le bouton', async () => {
    const fixture = await createComponent();

    await toggleRole(fixture, 1); // prof seul désormais
    saveButton(fixture).click();
    await fixture.whenStable();

    expect(saveProfile).toHaveBeenCalledWith({
      est_prof: true,
      est_eleve: false,
      systeme_scolaire: 'fr',
      nom_public: null,
      cherchable: false,
      enseignement: { education_level_ids: ['college'], subject_ids: ['math'] },
      apprentissage: null,
    });
    expect(el(fixture).querySelector('.profile__success')).not.toBeNull();
    expect(saveButton(fixture).disabled).toBe(true); // plus de modification en attente
  });

  it('affiche l’erreur d’enregistrement et permet de réessayer', async () => {
    saveProfile.mockRejectedValue(new Error('down'));
    const fixture = await createComponent();

    await toggleRole(fixture, 1);
    saveButton(fixture).click();
    await fixture.whenStable();

    expect(el(fixture).querySelector('.profile__error')).not.toBeNull();
    expect(saveButton(fixture).disabled).toBe(false); // toujours modifié → retry possible
  });

  it('une modification efface le message de succès', async () => {
    const fixture = await createComponent();

    await toggleRole(fixture, 1);
    saveButton(fixture).click();
    await fixture.whenStable();
    expect(el(fixture).querySelector('.profile__success')).not.toBeNull();

    await toggleRole(fixture, 1); // recoche élève
    expect(el(fixture).querySelector('.profile__success')).toBeNull();
  });

  describe('photo de profil', () => {
    function avatarInput(fixture: ComponentFixture<Profile>): HTMLInputElement {
      return el(fixture).querySelector<HTMLInputElement>('.profile__avatar input[type="file"]')!;
    }

    function pickFile(fixture: ComponentFixture<Profile>): void {
      const input = avatarInput(fixture);
      Object.defineProperty(input, 'files', {
        value: [new File(['x'], 'photo.png', { type: 'image/png' })],
        configurable: true,
      });
      input.dispatchEvent(new Event('change'));
    }

    it('le choix d’un fichier ouvre la modale de recadrage (jamais d’upload direct)', async () => {
      const open = vi.spyOn(AvatarCropDialog.prototype, 'open').mockImplementation(() => {});
      const fixture = await createComponent();

      pickFile(fixture);

      expect(open).toHaveBeenCalledOnce();
      expect(uploadAvatar).not.toHaveBeenCalled();
      expect(avatarInput(fixture).value).toBe(''); // vidé : re-choix possible
    });

    it('le blob recadré déclenche uploadAvatar', async () => {
      const fixture = await createComponent();
      const blob = new Blob(['jpg'], { type: 'image/jpeg' });

      fixture.debugElement
        .query(By.directive(AvatarCropDialog))
        .componentInstance.cropped.emit(blob);
      await fixture.whenStable();

      expect(uploadAvatar).toHaveBeenCalledWith(blob);
    });

    it('« Supprimer la photo » appelle deleteAvatar (visible seulement avec avatar)', async () => {
      profileSignal.set({ ...USER_PROFILE_ALIGNED_FIXTURE, avatar_url: 'https://s3.test/a.jpg' });
      const fixture = await createComponent();

      const remove = el(fixture).querySelector<HTMLButtonElement>('.profile__avatar .btn--ghost')!;
      remove.click();
      await fixture.whenStable();

      expect(deleteAvatar).toHaveBeenCalledOnce();
    });

    it('sans avatar : bouton « Ajouter », pas de bouton supprimer', async () => {
      const fixture = await createComponent();
      expect(el(fixture).querySelector('.profile__avatar .btn--ghost')).toBeNull();
      expect(el(fixture).querySelector('.profile__avatar app-user-avatar svg')).not.toBeNull();
    });

    it('une mutation d’avatar n’active pas le bouton Enregistrer', async () => {
      const fixture = await createComponent();
      expect(saveButton(fixture).disabled).toBe(true);

      fixture.debugElement
        .query(By.directive(AvatarCropDialog))
        .componentInstance.cropped.emit(new Blob(['jpg']));
      await fixture.whenStable();

      expect(saveButton(fixture).disabled).toBe(true);
    });

    it('affiche l’erreur quand l’upload échoue', async () => {
      uploadAvatar.mockRejectedValue(new Error('down'));
      const fixture = await createComponent();

      fixture.debugElement
        .query(By.directive(AvatarCropDialog))
        .componentInstance.cropped.emit(new Blob(['jpg']));
      await fixture.whenStable();

      expect(el(fixture).querySelector('.profile__avatar .profile__error')).not.toBeNull();
    });
  });
});
