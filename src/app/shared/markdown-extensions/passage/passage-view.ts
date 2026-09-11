import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownExtensionComponent } from '../markdown-extension.model';
import { parsePassageConfig } from './passage-config';

/**
 * Rendu d'un fence ```passage : une ligne par ligne de source, numéro dans la
 * marge toutes les `step` lignes, dessiné par le template (aucun `innerHTML`,
 * rien à sanitiser). Une ligne trop longue passe à la ligne, sa suite en
 * retrait, sans changer de numéro. Les numéros ne se sélectionnent pas — copier
 * un passage n'emporte que le texte — et sont précédés de « Ligne » pour les
 * technologies d'assistance.
 */
@Component({
  selector: 'app-passage-view',
  imports: [TranslocoPipe],
  templateUrl: './passage-view.html',
  styleUrl: './passage-view.scss',
})
export class PassageView implements MarkdownExtensionComponent {
  /** Source brute du fence (contrat d'extension). */
  readonly source = input.required<string>();

  protected readonly config = computed(() => parsePassageConfig(this.source()));

  /** Largeur de la marge : autant de chiffres que le plus grand numéro. */
  protected readonly gutter = computed(() => `${String(this.config().lastNumber).length}ch`);
}
