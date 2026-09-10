import {
  Component,
  computed,
  effect,
  ElementRef,
  input,
  signal,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import DOMPurify from 'dompurify';
import { MarkdownExtensionComponent } from '../markdown-extension.model';
import { parseSmilesConfig, SMILES_MAX_LENGTH, SmilesMolecule } from './smiles-config';

type SmilesDrawer = typeof import('smiles-drawer').default;

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Pixels par unité du viewBox de SmilesDrawer (liaison de 30 unités ≈ 45 px). */
const SCALE = 1.5;
/**
 * Formule topologique complète : `compactDrawing` (défaut) condense les
 * groupes terminaux en étiquettes — l'acide éthanoïque devenait « COOHCH₃ »
 * sans une seule liaison.
 */
const DRAWER_OPTIONS = { compactDrawing: false };

async function loadSmilesDrawer(): Promise<SmilesDrawer> {
  return (await import('smiles-drawer')).default;
}

/**
 * Rendu d'un fence ```smiles : une formule topologique par ligne, dessinée en
 * SVG par SmilesDrawer (importé au premier rendu, hors bundle initial) sur la
 * planche claire fixe (`--figure-board`) — ses couleurs d'atomes sont figées.
 * Le SVG produit est re-sanitisé, `<style>` interdit : SmilesDrawer y pose des
 * sélecteurs globaux (`.element`, `.sub`) qui fuiraient dans tout le document ;
 * leurs règles sont recréées, scopées, dans le SCSS. Une molécule invalide
 * affiche sa notice sans empêcher les autres.
 */
@Component({
  selector: 'app-smiles-view',
  imports: [TranslocoPipe],
  templateUrl: './smiles-view.html',
  styleUrl: './smiles-view.scss',
})
export class SmilesView implements MarkdownExtensionComponent {
  /** Source brute du fence (contrat d'extension). */
  readonly source = input.required<string>();

  protected readonly molecules = computed(() => parseSmilesConfig(this.source()));
  protected readonly boards = viewChildren<ElementRef<HTMLElement>>('board');
  /** Index des molécules que SmilesDrawer n'a pas pu lire ou dessiner. */
  protected readonly invalid = signal<ReadonlySet<number>>(new Set());
  protected readonly loadError = signal(false);

  constructor() {
    effect((onCleanup) => {
      const molecules = this.molecules();
      const boards = this.boards().map((ref) => ref.nativeElement);
      if (boards.length !== molecules.length) {
        return; // template pas encore aligné sur la nouvelle source
      }
      let stale = false;
      onCleanup(() => (stale = true));
      void this.#draw(molecules, boards, () => stale);
    });
  }

  async #draw(
    molecules: readonly SmilesMolecule[],
    boards: readonly HTMLElement[],
    isStale: () => boolean,
  ): Promise<void> {
    let drawer: SmilesDrawer;
    try {
      drawer = await loadSmilesDrawer();
    } catch {
      if (!isStale()) {
        this.loadError.set(true);
      }
      return;
    }
    if (isStale()) {
      return;
    }
    this.loadError.set(false);
    const invalid = new Set<number>();
    molecules.forEach((molecule, index) => {
      if (!drawMolecule(drawer, molecule.smiles, boards[index])) {
        invalid.add(index);
      }
    });
    this.invalid.set(invalid);
  }
}

/** Dessine une molécule dans sa planche ; `false` si le SMILES est illisible. */
function drawMolecule(drawer: SmilesDrawer, smiles: string, board: HTMLElement): boolean {
  board.replaceChildren();
  if (smiles.length > SMILES_MAX_LENGTH) {
    return false;
  }
  const svg = board.ownerDocument.createElementNS(SVG_NS, 'svg');
  board.appendChild(svg);
  let drawn = false;
  // `parse` est synchrone et rattrape aussi les erreurs levées pendant le dessin.
  drawer.parse(
    smiles,
    (tree) => {
      new drawer.SvgDrawer(DRAWER_OPTIONS).draw(tree, svg, 'light');
      drawn = true;
    },
    () => (drawn = false),
  );
  if (!drawn) {
    board.replaceChildren();
    return false;
  }
  const [, , width, height] = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  if (width > 0 && height > 0) {
    svg.setAttribute('width', String(Math.round(width * SCALE)));
    svg.setAttribute('height', String(Math.round(height * SCALE)));
  }
  board.innerHTML = DOMPurify.sanitize(board.innerHTML, {
    USE_PROFILES: { svg: true },
    FORBID_TAGS: ['style'],
  });
  return true;
}
