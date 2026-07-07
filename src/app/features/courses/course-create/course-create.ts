import { Component, computed, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  buildCourseForm,
  isCourseFormComplete,
  payloadFromCourseForm,
} from '../../../core/courses/course-form';
import { CourseService } from '../../../core/courses/course.service';
import { EducationLevelService } from '../../../core/education-levels/education-level.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { UserProfileService } from '../../../core/users/user-profile.service';
import { EducationLevelPicker } from '../../../shared/education-level-picker/education-level-picker';
import { SubjectMultiPicker } from '../../../shared/subject-multi-picker/subject-multi-picker';

/**
 * Création d'un cours : titre, description optionnelle, classement matières /
 * niveaux (le picker de niveaux est filtré par le système scolaire du profil).
 * À la création, on file droit vers l'espace blocs du cours créé.
 */
@Component({
  selector: 'app-course-create',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    EducationLevelPicker,
    SubjectMultiPicker,
  ],
  templateUrl: './course-create.html',
  styleUrl: './course-create.scss',
})
export class CourseCreate implements OnInit {
  readonly #courses = inject(CourseService);
  readonly #profiles = inject(UserProfileService);
  readonly #levels = inject(EducationLevelService);
  readonly #router = inject(Router);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly language = inject(LanguageService);

  protected readonly form = buildCourseForm();
  /** Miroir signal du formulaire (réactivité zoneless des computed/template). */
  readonly #formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  protected readonly saving = signal(false);
  protected readonly saveError = signal(false);

  /** Système scolaire du profil : filtre le picker de niveaux (`null` = tous). */
  protected readonly systeme = signal<string | null>(null);

  protected readonly canSubmit = computed(
    () => !this.saving() && isCourseFormComplete(this.#formValue()),
  );

  ngOnInit(): void {
    if (!this.#isBrowser) {
      return;
    }
    this.#levels.load();
    // Le profil ne fait que filtrer le picker : s'il est injoignable, on
    // montre tous les systèmes plutôt que de bloquer la création.
    void this.#profiles
      .ensureLoaded()
      .then((profile) => this.systeme.set(profile.systeme_scolaire))
      .catch(() => undefined);
  }

  protected async save(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(false);
    try {
      const course = await this.#courses.createCourse(payloadFromCourseForm(this.form));
      // Droit vers l'espace blocs du cours créé (saving reste posé : le
      // bouton demeure inactif pendant la navigation).
      await this.#router.navigate(['/', this.language.lang(), 'courses', course.id]);
    } catch {
      this.saveError.set(true);
      this.saving.set(false);
    }
  }
}
