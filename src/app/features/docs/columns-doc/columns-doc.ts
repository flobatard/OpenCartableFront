import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../../shared/markdown-playground/markdown-playground';
import { MarkdownView } from '../../../shared/markdown-view/markdown-view';

/**
 * Page de documentation des colonnes (`::: columns` … `+++` … `:::`, rendues
 * par le pipeline — core/markdown/course-columns.ts) — montée par DocsShell
 * (slug `columns`). Ce n'est pas un fence : un conteneur dont chaque colonne
 * est du markdown complet. Bacs à sable empilés (`stacked`) : côte à côte,
 * leur aperçu serait trop étroit et empilerait toujours les colonnes. Prose via
 * i18n `docs.columns.*` ; sources d'exemples en constantes non traduites (c'est
 * de la syntaxe) et sans ressource ni module, qui exigent un cours.
 */
@Component({
  selector: 'app-columns-doc',
  imports: [MarkdownPlayground, MarkdownView, TranslocoPipe],
  templateUrl: './columns-doc.html',
})
export class ColumnsDoc {
  protected readonly firstExample =
    '::: columns\n' +
    '> [!DEFINITION] Nombre premier\n' +
    '> Un entier naturel qui a exactement deux diviseurs : $1$ et lui-même.\n' +
    '+++\n' +
    '> [!EXAMPLE]\n' +
    '> $13$ est premier ; $15 = 3 \\times 5$ ne l’est pas.\n' +
    ':::\n' +
    '\n' +
    'Le texte reprend ici, sur toute la largeur.';

  protected readonly ratioExample =
    '::: columns 1:2\n' +
    '```smiles\n' +
    'CCO | Éthanol\n' +
    '```\n' +
    '+++\n' +
    'L’**éthanol** est l’alcool des boissons alcoolisées. Sa formule brute,\n' +
    '$\\ce{C2H6O}$, compte deux atomes de carbone, six d’hydrogène et un d’oxygène.\n' +
    '\n' +
    'Son groupe **hydroxyle** $\\ce{-OH}$ en fait un alcool.\n' +
    ':::';

  protected readonly contentExample =
    '::: columns\n' +
    '**Le programme**\n' +
    '\n' +
    '```python\n' +
    'for n in range(1, 6):\n' +
    '    print(n, n ** 2)\n' +
    '```\n' +
    '+++\n' +
    '**Ce qu’il fait**\n' +
    '\n' +
    '1. $n$ parcourt les entiers de $1$ à $5$.\n' +
    '2. Chaque ligne affiche $n$ puis son carré.\n' +
    '\n' +
    '$$1 + 4 + 9 + 16 + 25 = 55$$\n' +
    ':::';

  protected readonly invalidExample =
    '::: columns\n' + 'Il manque le séparateur : rien n’est mis en colonnes.\n' + ':::';
}
