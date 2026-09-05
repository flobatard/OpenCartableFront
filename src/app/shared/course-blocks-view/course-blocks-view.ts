import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CourseBlock } from '../../core/courses/course.model';
import { payloadFromDocumentContent } from '../../core/courses/document-form';
import { CourseResource } from '../../core/resources/resource.model';
import {
  CorrectionRequest,
  QuestionThread,
  ThreadsClearRequest,
} from '../../core/student/exercise-correction';
import { MarkdownView } from '../markdown-view/markdown-view';
import { ModuleEmbed } from '../module-runner/module-embed';
import { CoursePreviewDocument } from './course-preview-document';
import { ExerciseView, ExerciseViewMode } from './exercise-view';

/**
 * Rendu en lecture des blocs d'un cours, dans l'ordre du back — extraction de
 * la boucle de `course-preview` (onglet Aperçu prof), partagée avec la vue
 * élève. Présentational pur : les blocs et les ressources lui sont
 * passés résolus ; les accès réseau (présignature, code des modules) passent
 * par les résolveurs injectés (`COURSE_*_RESOLVER`) des composants enfants —
 * prof par défaut, publics sur les routes élèves.
 *
 * Vue élève par construction : un bloc exercice est rendu par `ExerciseView`
 * (sujet puis cartes « Question n »), dont la projection
 * `exerciseViewFromContent` exclut les réponses attendues — et côté routes
 * publiques, le back ne les sert même pas. `exerciseMode` choisit son mode :
 * `preview` (défaut — Aperçu prof, cours entier : énoncés seuls) ou `solve`
 * (le bloc seul de la vue élève : zones de réponse, réponses en localStorage).
 *
 * `exerciseLink` (optionnel) : commandes routerLink de la page où l'exercice
 * se résout (le bloc seul) — un CTA « Résoudre l'exercice » s'affiche sous le
 * bloc. `null` (défaut : contexte prof, ou bloc déjà en mode `solve`) : pas
 * de CTA.
 *
 * Tuteur IA des exercices (relayé tel quel à `ExerciseView`, câblé par
 * `StudentBlock` pour l'élève connecté) : `correctionEnabled`,
 * `correctionLoginHint`, `threads` (fils par id de question), `blockLink`
 * (navigation des citations `oc-block:`), `correctionRequested`,
 * `threadsClearRequested` et `loginRequested`.
 *
 * Garde la classe `.course-preview__block` : `_print.scss` (global) s'appuie
 * dessus pour paginer l'export PDF (un bloc par page).
 * Client-only (markdown-view, présignature, iframe sandbox).
 */
@Component({
  selector: 'app-course-blocks-view',
  imports: [
    TranslocoPipe,
    RouterLink,
    MarkdownView,
    CoursePreviewDocument,
    ModuleEmbed,
    ExerciseView,
  ],
  templateUrl: './course-blocks-view.html',
  styleUrl: './course-blocks-view.scss',
})
export class CourseBlocksView {
  /** Blocs déjà ordonnés par le back. */
  readonly blocks = input.required<CourseBlock[]>();
  readonly courseId = input.required<string>();
  /** Ressources du cours (résolution des blocs document). */
  readonly resources = input<readonly CourseResource[]>([]);
  /** Lien vers la page où l'exercice se résout (`null` = pas de CTA). */
  readonly exerciseLink = input<((blockId: string) => string[]) | null>(null);
  /** Mode de rendu des blocs exercice (cf. `ExerciseView`). */
  readonly exerciseMode = input<ExerciseViewMode>('preview');
  /** Tuteur IA des exercices — relais vers `ExerciseView` (cf. sa doc). */
  readonly correctionEnabled = input(false);
  readonly correctionLoginHint = input(false);
  readonly threads = input<Readonly<Record<string, QuestionThread>>>({});
  readonly blockLink = input<((blockId: string) => string[]) | null>(null);
  readonly correctionRequested = output<CorrectionRequest>();
  readonly threadsClearRequested = output<ThreadsClearRequest>();
  readonly loginRequested = output<void>();

  /** Markdown d'un bloc texte (`content.markdown`, gardé string). */
  protected textMarkdown(block: CourseBlock): string {
    return typeof block.content['markdown'] === 'string' ? block.content['markdown'] : '';
  }

  /** Légende éditoriale d'un bloc document (`content.caption`, gardé string). */
  protected documentCaption(block: CourseBlock): string | null {
    return typeof block.content['caption'] === 'string' ? block.content['caption'] : null;
  }

  /** Mode d'affichage éditorial d'un bloc document (repli `inline`). */
  protected documentDisplay(block: CourseBlock): 'inline' | 'download' {
    return payloadFromDocumentContent(block.content).display;
  }

  /** Ressource pointée par un bloc document (id inconnu/supprimé → `undefined`). */
  protected resourceFor(id: string | null): CourseResource | undefined {
    return id === null ? undefined : this.resources().find((r) => r.id === id);
  }

  /** Commandes du CTA « Résoudre l'exercice » du bloc, ou `null`. */
  protected exerciseLinkFor(block: CourseBlock): string[] | null {
    const build = this.exerciseLink();
    return build === null ? null : build(block.id);
  }
}
