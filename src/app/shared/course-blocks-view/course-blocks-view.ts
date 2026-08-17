import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CourseBlock } from '../../core/courses/course.model';
import { payloadFromDocumentContent } from '../../core/courses/document-form';
import { exerciseMarkdownFromContent } from '../../core/courses/exercise-form';
import { CourseResource } from '../../core/resources/resource.model';
import { MarkdownView } from '../markdown-view/markdown-view';
import { ModuleEmbed } from '../module-runner/module-embed';
import { CoursePreviewDocument } from './course-preview-document';

/**
 * Rendu en lecture des blocs d'un cours, dans l'ordre du back — extraction de
 * la boucle de `course-preview` (onglet Aperçu prof), partagée avec la vue
 * élève (J2). Présentational pur : les blocs et les ressources lui sont
 * passés résolus ; les accès réseau (présignature, code des modules) passent
 * par les résolveurs injectés (`COURSE_*_RESOLVER`) des composants enfants —
 * prof par défaut, publics sur les routes élèves.
 *
 * Vue élève par construction : les réponses attendues des exercices sont
 * exclues du markdown (`exerciseMarkdownFromContent`) — et côté routes
 * publiques, le back ne les sert même pas.
 *
 * `exerciseLink` (optionnel) : commandes routerLink de l'écran de résolution
 * d'un bloc exercice — un CTA « Résoudre l'exercice » s'affiche sous le bloc.
 * `null` (défaut, contexte prof) : pas de CTA.
 *
 * Garde la classe `.course-preview__block` : `_print.scss` (global) s'appuie
 * dessus pour paginer l'export PDF (un bloc par page).
 * Client-only (markdown-view, présignature, iframe sandbox).
 */
@Component({
  selector: 'app-course-blocks-view',
  imports: [TranslocoPipe, RouterLink, MarkdownView, CoursePreviewDocument, ModuleEmbed],
  templateUrl: './course-blocks-view.html',
  styleUrl: './course-blocks-view.scss',
})
export class CourseBlocksView {
  /** Blocs déjà ordonnés par le back. */
  readonly blocks = input.required<CourseBlock[]>();
  readonly courseId = input.required<string>();
  /** Ressources du cours (résolution des blocs document). */
  readonly resources = input<readonly CourseResource[]>([]);
  /** Lien vers l'écran de résolution d'un exercice (`null` = pas de CTA). */
  readonly exerciseLink = input<((blockId: string) => string[]) | null>(null);

  /** Markdown d'un bloc texte (`content.markdown`, gardé string). */
  protected textMarkdown(block: CourseBlock): string {
    return typeof block.content['markdown'] === 'string' ? block.content['markdown'] : '';
  }

  /** Markdown concaténé d'un bloc exercice (sujet + énoncés, réponses exclues). */
  protected exerciseMarkdown(block: CourseBlock): string {
    return exerciseMarkdownFromContent(block.content);
  }

  /** Légende éditoriale d'un bloc document (`content.legende`, gardé string). */
  protected documentLegende(block: CourseBlock): string | null {
    return typeof block.content['legende'] === 'string' ? block.content['legende'] : null;
  }

  /** Mode d'affichage éditorial d'un bloc document (repli `inline`). */
  protected documentAffichage(block: CourseBlock): 'inline' | 'telechargement' {
    return payloadFromDocumentContent(block.content).affichage;
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
