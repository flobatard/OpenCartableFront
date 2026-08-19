import {
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { EducationLevelService } from '../../core/education-levels/education-level.service';
import {
  buildProfileForm,
  isProfileComplete,
  patchFormFromProfile,
  payloadFromForm,
  wireProfileFormCoherence,
} from '../../core/users/profile-form';
import { UserProfileService } from '../../core/users/user-profile.service';
import { AvatarCropDialog } from '../../shared/avatar-crop-dialog/avatar-crop-dialog';
import { EducationLevelPicker } from '../../shared/education-level-picker/education-level-picker';
import { SubjectMultiPicker } from '../../shared/subject-multi-picker/subject-multi-picker';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';

/**
 * Consultation et édition du profil saisi à l'onboarding — mêmes sections,
 * affichées à plat (pas de stepper), pré-remplies depuis l'API. La
 * sauvegarde passe par le même `PUT` à sémantique de remplacement.
 *
 * « Enregistrer » n'est actif que si le formulaire est complet ET modifié :
 * l'état sauvegardé est mémorisé en snapshot JSON du payload (déterministe :
 * niveaux en ordre d'arbre, matières en ordre d'ajout dédoublonné).
 */
@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    AvatarCropDialog,
    EducationLevelPicker,
    SubjectMultiPicker,
    UserAvatar,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile implements OnInit {
  readonly #profiles = inject(UserProfileService);
  readonly #transloco = inject(TranslocoService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly levels = inject(EducationLevelService);

  protected readonly form = buildProfileForm();

  /** Miroir signal du formulaire (réactivité zoneless des computed/template). */
  readonly #formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveSuccess = signal(false);
  protected readonly saveError = signal(false);

  /* Photo de profil — flux à effet IMMÉDIAT (presign/PUT S3/confirm via le
     service), volontairement HORS du formulaire et de son cycle
     dirty/#savedPayload : le payload du PUT profil ne porte pas l'avatar. */
  protected readonly avatarUrl = computed(() => this.#profiles.profile()?.avatar_url ?? null);
  protected readonly avatarState = this.#profiles.avatarState;
  protected readonly avatarError = signal(false);

  protected readonly avatarInput = viewChild<ElementRef<HTMLInputElement>>('avatarInput');
  protected readonly cropDialog = viewChild<AvatarCropDialog>('cropDialog');

  /** Snapshot JSON du dernier payload persisté (chargé ou sauvegardé). */
  readonly #savedPayload = signal<string | null>(null);

  protected readonly systemes = computed(() => [
    ...new Set(this.levels.tree().map((root) => root.systeme)),
  ]);

  protected readonly systemeValue = computed(() => this.#formValue().systeme ?? null);
  protected readonly estProf = computed(() => !!this.#formValue().estProf);
  protected readonly estEleve = computed(() => !!this.#formValue().estEleve);

  protected readonly dirty = computed(() => {
    this.#formValue(); // dépendance : réévalué à chaque modification du formulaire
    return JSON.stringify(payloadFromForm(this.form)) !== this.#savedPayload();
  });

  protected readonly canSave = computed(
    () => this.dirty() && !this.saving() && isProfileComplete(this.#formValue()),
  );

  constructor() {
    wireProfileFormCoherence(this.form);
    // Toute modification efface le message de succès précédent.
    this.form.valueChanges.subscribe(() => this.saveSuccess.set(false));
  }

  async ngOnInit(): Promise<void> {
    if (!this.#isBrowser) {
      return;
    }
    this.levels.load();
    await this.loadProfile();
  }

  protected async loadProfile(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const profile = await this.#profiles.ensureLoaded();
      patchFormFromProfile(this.form, profile);
      this.#savedPayload.set(JSON.stringify(payloadFromForm(this.form)));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected selectSysteme(code: string): void {
    this.form.controls.systeme.setValue(code);
  }

  /** Libellé i18n du système, repli sur le code brut (13e système seedé). */
  protected systemeLabel(code: string): string {
    const key = `onboarding.systems.${code}`;
    const label = this.#transloco.translate(key);
    return label === key ? code : label;
  }

  /** Ouvre le sélecteur de fichier de la photo de profil. */
  protected openAvatarPicker(): void {
    this.avatarInput()?.nativeElement.click();
  }

  /**
   * Fichier choisi → modale de recadrage. L'input est vidé aussitôt pour
   * permettre de re-choisir le même fichier (motif course-resources) ; le
   * type est laissé au navigateur (`accept`) et au décodage de la modale
   * (échec → message badImage) : l'export canvas re-encode en JPEG de toute
   * façon.
   */
  protected onAvatarPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.avatarError.set(false);
    this.cropDialog()?.open(file);
  }

  /** Blob carré exporté par la modale → upload immédiat (presign/S3/confirm). */
  protected async onAvatarCropped(blob: Blob): Promise<void> {
    this.avatarError.set(false);
    try {
      await this.#profiles.uploadAvatar(blob);
    } catch {
      this.avatarError.set(true);
    }
  }

  protected async removeAvatar(): Promise<void> {
    this.avatarError.set(false);
    try {
      await this.#profiles.deleteAvatar();
    } catch {
      this.avatarError.set(true);
    }
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(false);
    try {
      await this.#profiles.saveProfile(payloadFromForm(this.form));
      this.#savedPayload.set(JSON.stringify(payloadFromForm(this.form)));
      this.saveSuccess.set(true);
    } catch {
      this.saveError.set(true);
    } finally {
      this.saving.set(false);
    }
  }
}
