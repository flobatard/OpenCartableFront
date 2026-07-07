import { Component, computed, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { EducationLevelService } from '../../core/education-levels/education-level.service';
import { LanguageService } from '../../core/i18n/language.service';
import { OnboardingPayload } from '../../core/users/user-profile.model';
import { UserProfileService } from '../../core/users/user-profile.service';
import { EducationLevelPicker } from '../../shared/education-level-picker/education-level-picker';
import { SubjectMultiPicker } from '../../shared/subject-multi-picker/subject-multi-picker';

/** Étapes possibles ; la liste effective dérive des rôles cochés. */
type OnboardingStep =
  | 'roles'
  | 'systeme'
  | 'levelsTaught'
  | 'subjectsTaught'
  | 'levelsLearned'
  | 'subjectsLearned';

/** Un bloc de sélections par contexte (enseigne / apprend). */
function blocGroup() {
  return new FormGroup({
    educationLevelIds: new FormControl<string[]>([], { nonNullable: true }),
    subjectIds: new FormControl<string[]>([], { nonNullable: true }),
  });
}

/**
 * Onboarding bloquant post-login : rôles (cumulables) → système scolaire →
 * niveaux/matières par rôle. Stepper dynamique : 4 étapes pour un rôle seul,
 * 6 pour prof + élève. Un profil déjà complet est renvoyé vers `next`
 * (chemin interne validé) ou la page matières.
 *
 * Premier usage des Reactive Forms typés du projet ; en zoneless, la
 * réactivité du template passe par `toSignal(form.valueChanges)`.
 */
@Component({
  selector: 'app-onboarding',
  imports: [ReactiveFormsModule, TranslocoPipe, EducationLevelPicker, SubjectMultiPicker],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class Onboarding implements OnInit {
  readonly #profiles = inject(UserProfileService);
  readonly #router = inject(Router);
  readonly #route = inject(ActivatedRoute);
  readonly #language = inject(LanguageService);
  readonly #transloco = inject(TranslocoService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly levels = inject(EducationLevelService);

  protected readonly form = new FormGroup({
    estProf: new FormControl(false, { nonNullable: true }),
    estEleve: new FormControl(false, { nonNullable: true }),
    systeme: new FormControl<string | null>(null),
    enseignement: blocGroup(),
    apprentissage: blocGroup(),
  });

  /** Miroir signal du formulaire (réactivité zoneless des computed/template). */
  readonly #formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal(false);

  readonly #stepIndex = signal(0);

  /** Étapes effectives : chaque rôle coché ajoute ses deux étapes. */
  protected readonly steps = computed<OnboardingStep[]>(() => {
    const v = this.#formValue();
    return [
      'roles' as const,
      'systeme' as const,
      ...(v.estProf ? (['levelsTaught', 'subjectsTaught'] as const) : []),
      ...(v.estEleve ? (['levelsLearned', 'subjectsLearned'] as const) : []),
    ];
  });

  /** Index clampé : décocher un rôle en revenant en arrière raccourcit la liste. */
  protected readonly currentIndex = computed(() =>
    Math.min(this.#stepIndex(), this.steps().length - 1),
  );

  protected readonly currentStep = computed(() => this.steps()[this.currentIndex()]);

  protected readonly isLast = computed(() => this.currentIndex() === this.steps().length - 1);

  /** Systèmes scolaires dérivés des racines de l'arbre (pas de liste en dur). */
  protected readonly systemes = computed(() => [
    ...new Set(this.levels.tree().map((root) => root.systeme)),
  ]);

  protected readonly systemeValue = computed(() => this.#formValue().systeme ?? null);

  protected readonly canProceed = computed(() => {
    const v = this.#formValue();
    switch (this.currentStep()) {
      case 'roles':
        return !!(v.estProf || v.estEleve);
      case 'systeme':
        return !!v.systeme;
      case 'levelsTaught':
        return (v.enseignement?.educationLevelIds?.length ?? 0) > 0;
      case 'subjectsTaught':
        return (v.enseignement?.subjectIds?.length ?? 0) > 0;
      case 'levelsLearned':
        return (v.apprentissage?.educationLevelIds?.length ?? 0) > 0;
      case 'subjectsLearned':
        return (v.apprentissage?.subjectIds?.length ?? 0) > 0;
    }
  });

  constructor() {
    // Décocher un rôle vide ses sélections (ses étapes disparaissent).
    this.form.controls.estProf.valueChanges.subscribe((estProf) => {
      if (!estProf) {
        this.form.controls.enseignement.reset();
      }
    });
    this.form.controls.estEleve.valueChanges.subscribe((estEleve) => {
      if (!estEleve) {
        this.form.controls.apprentissage.reset();
      }
    });
    // Changer de système invalide les niveaux choisis (ils lui appartiennent).
    this.form.controls.systeme.valueChanges.subscribe(() => {
      this.form.controls.enseignement.controls.educationLevelIds.setValue([]);
      this.form.controls.apprentissage.controls.educationLevelIds.setValue([]);
    });
  }

  async ngOnInit(): Promise<void> {
    if (!this.#isBrowser) {
      return;
    }
    this.levels.load();
    await this.loadProfile();
  }

  /** Charge le profil ; un profil déjà onboardé est renvoyé vers sa cible. */
  protected async loadProfile(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const profile = await this.#profiles.ensureLoaded();
      if (profile.onboarding_complete) {
        await this.#router.navigateByUrl(this.#target(), { replaceUrl: true });
        return;
      }
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

  protected back(): void {
    this.#stepIndex.set(Math.max(0, this.currentIndex() - 1));
  }

  protected next(): void {
    if (this.canProceed() && !this.isLast()) {
      this.#stepIndex.set(this.currentIndex() + 1);
    }
  }

  protected async submit(): Promise<void> {
    if (!this.canProceed() || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.submitError.set(false);
    const v = this.form.getRawValue();
    const payload: OnboardingPayload = {
      est_prof: v.estProf,
      est_eleve: v.estEleve,
      systeme_scolaire: v.systeme ?? '',
      enseignement: v.estProf
        ? {
            education_level_ids: v.enseignement.educationLevelIds,
            subject_ids: v.enseignement.subjectIds,
          }
        : null,
      apprentissage: v.estEleve
        ? {
            education_level_ids: v.apprentissage.educationLevelIds,
            subject_ids: v.apprentissage.subjectIds,
          }
        : null,
    };
    try {
      await this.#profiles.submitOnboarding(payload);
      await this.#router.navigateByUrl(this.#target(), { replaceUrl: true });
    } catch {
      this.submitError.set(true);
    } finally {
      this.submitting.set(false);
    }
  }

  /** Cible post-onboarding : `?next=` interne validé, sinon la page matières. */
  #target(): string {
    const next = this.#route.snapshot.queryParamMap.get('next');
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      return next;
    }
    return `/${this.#language.lang()}/subjects`;
  }
}
