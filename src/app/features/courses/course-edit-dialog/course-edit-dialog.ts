import { Component, computed, inject, output, signal, viewChild } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  buildCourseMetaForm,
  isCourseMetaFormComplete,
  patchCourseMetaForm,
  payloadFromCourseMetaForm,
} from '../../../core/courses/course-meta-form';
import { CourseUpdatePayload } from '../../../core/courses/course.model';
import { UserProfileService } from '../../../core/users/user-profile.service';
import { NativeDialog } from '../../../shared/dialog/native-dialog.directive';
import { EducationLevelPicker } from '../../../shared/education-level-picker/education-level-picker';
import { SubjectMultiPicker } from '../../../shared/subject-multi-picker/subject-multi-picker';

/**
 * Modale d'édition d'un cours : titre, description, classement matières et
 * niveaux — les mêmes champs qu'à la création, avec les mêmes pickers.
 * Élément `<dialog>` natif (focus-trap, Escape, backdrop délégués à la
 * plateforme), calquée sur `BlockCreateDialog` : présentationnelle — le parent
 * l'ouvre par `open(course)` et reçoit `save`, c'est lui qui appelle l'API.
 * Le titre est requis (colonne NOT NULL côté back) ; le classement part en
 * remplacement (listes complètes). Le picker de niveaux est filtré par le
 * système scolaire du profil, résolu à l'ouverture (`ensureLoaded` est en
 * cache) — s'il est injoignable, on montre tous les systèmes plutôt que de
 * bloquer l'édition, comme à la création.
 */
@Component({
  selector: 'app-course-edit-dialog',
  imports: [
    NativeDialog,
    ReactiveFormsModule,
    TranslocoPipe,
    EducationLevelPicker,
    SubjectMultiPicker,
  ],
  templateUrl: './course-edit-dialog.html',
  styleUrl: './course-edit-dialog.scss',
})
export class CourseEditDialog {
  readonly #profiles = inject(UserProfileService);

  protected readonly dialog = viewChild(NativeDialog);

  protected readonly form = buildCourseMetaForm();

  /**
   * Miroir signal de la saisie (zoneless). Posé à l'ouverture — le `setValue`
   * du pré-remplissage n'émet pas — puis tenu en phase par `valueChanges` ;
   * jamais `toSignal(valueChanges)`, qui manquerait le pré-remplissage et
   * laisserait « Enregistrer » désactivé sur un cours déjà titré.
   */
  readonly #value = signal(this.form.value);

  /** Titre non blanc : même règle que le back (sinon 422). */
  protected readonly complete = computed(() => isCourseMetaFormComplete(this.#value()));

  /** Enregistrement en vol : fige la modale le temps de l'aller-retour. */
  protected readonly saving = signal(false);

  /** Système scolaire du profil : filtre le picker de niveaux (`null` = tous). */
  protected readonly system = signal<string | null>(null);

  readonly save = output<CourseUpdatePayload>();

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => this.#value.set(value));
  }

  open(course: {
    title: string;
    description: string | null;
    subject_ids: string[];
    education_level_ids: string[];
  }): void {
    patchCourseMetaForm(this.form, course);
    this.#value.set(this.form.value);
    this.saving.set(false);
    this.dialog()?.open();
    void this.#profiles
      .ensureLoaded()
      .then((profile) => this.system.set(profile.school_system))
      .catch(() => undefined);
  }

  close(): void {
    this.dialog()?.close();
  }

  /**
   * Rend la main au parent : la saisie reste à l'écran (`saving`) jusqu'à ce
   * qu'il appelle `close()` ou `failed()` — sur échec, rien n'est perdu.
   */
  protected submit(): void {
    if (!this.complete() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.save.emit(payloadFromCourseMetaForm(this.form));
  }

  /** Réarme la modale après un échec côté parent (la saisie est conservée). */
  failed(): void {
    this.saving.set(false);
  }
}
