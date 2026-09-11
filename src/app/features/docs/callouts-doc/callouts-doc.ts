import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CalloutKind } from '../../../core/markdown/course-callouts';
import { MarkdownPlayground } from '../../../shared/markdown-playground/markdown-playground';
import { MarkdownView } from '../../../shared/markdown-view/markdown-view';

/**
 * Page de documentation des encadrés (`> [!DEFINITION]`…, rendus par le
 * pipeline — core/markdown/course-callouts.ts) — montée par DocsShell (slug
 * `callouts`). Ce n'est pas un fence : la syntaxe est celle des alertes
 * GitHub. Prose via i18n `docs.callouts.*` ; sources d'exemples en constantes
 * non traduites (c'est de la syntaxe).
 */
@Component({
  selector: 'app-callouts-doc',
  imports: [MarkdownPlayground, MarkdownView, TranslocoPipe],
  templateUrl: './callouts-doc.html',
})
export class CalloutsDoc {
  /** Mot-clé de chacun des six types, dans l'ordre de `CALLOUT_KINDS`. */
  protected readonly kinds = [
    { keyword: '[!DEFINITION]', kind: 'definition' },
    { keyword: '[!KEYPOINT]', kind: 'keypoint' },
    { keyword: '[!METHOD]', kind: 'method' },
    { keyword: '[!EXAMPLE]', kind: 'example' },
    { keyword: '[!NOTE]', kind: 'note' },
    { keyword: '[!WARNING]', kind: 'warning' },
  ] as const satisfies readonly { keyword: string; kind: CalloutKind }[];

  /**
   * Alias reconnus pour toujours : les mots-clés français de la syntaxe
   * d'origine, puis ceux des alertes GitHub sans graphie canonique (NOTE et
   * WARNING en sont déjà). Libellés via `markdownView.callouts.*`.
   */
  protected readonly aliases = [
    { keyword: '[!RETENIR]', kind: 'keypoint' },
    { keyword: '[!À RETENIR]', kind: 'keypoint' },
    { keyword: '[!METHODE]', kind: 'method' },
    { keyword: '[!EXEMPLE]', kind: 'example' },
    { keyword: '[!REMARQUE]', kind: 'note' },
    { keyword: '[!ATTENTION]', kind: 'warning' },
    { keyword: '[!TIP]', kind: 'method' },
    { keyword: '[!IMPORTANT]', kind: 'keypoint' },
    { keyword: '[!CAUTION]', kind: 'warning' },
  ] as const satisfies readonly { keyword: string; kind: CalloutKind }[];

  protected readonly firstExample =
    '> [!DEFINITION]\n' +
    '> Une **fonction affine** est une fonction de la forme $f(x) = ax + b$,\n' +
    '> où $a$ et $b$ sont deux nombres réels.\n' +
    '\n' +
    'Le texte reprend ici, après une ligne vide.';

  protected readonly kindsExample =
    '> [!DEFINITION]\n' +
    '> Le **périmètre** d’une figure est la longueur de son contour.\n' +
    '\n' +
    '> [!KEYPOINT]\n' +
    '> Un cercle de rayon $r$ a pour périmètre $2\\pi r$.\n' +
    '\n' +
    '> [!METHOD]\n' +
    '> Pour un polygone, on additionne les longueurs de tous ses côtés.\n' +
    '\n' +
    '> [!EXAMPLE]\n' +
    '> Un carré de côté $3$ cm a pour périmètre $4 \\times 3 = 12$ cm.\n' +
    '\n' +
    '> [!NOTE]\n' +
    '> Un périmètre s’exprime dans une unité de longueur : cm, m, km…\n' +
    '\n' +
    '> [!WARNING]\n' +
    '> Ne pas confondre le périmètre (en cm) et l’aire (en cm²).';

  protected readonly customTitleExample =
    '> [!KEYPOINT] Théorème de Pythagore\n' +
    '> Si le triangle $ABC$ est rectangle en $C$, alors $AB^2 = AC^2 + BC^2$.\n' +
    '\n' +
    '> [!WARNING] Le piège du signe $-$\n' +
    '> $(-3)^2 = 9$, mais $-3^2 = -9$ : la puissance passe avant le signe.';

  protected readonly contentExample =
    '> [!METHOD] Résoudre une équation $ax + b = 0$\n' +
    '> 1. Isoler le terme en $x$ : $ax = -b$.\n' +
    '> 2. Diviser par $a$, qui doit être non nul :\n' +
    '>\n' +
    '> $$x = -\\frac{b}{a}$$\n' +
    '>\n' +
    '> Une ligne `>` vide sépare deux paragraphes de l’encadré.';

  protected readonly keywordsExample =
    '> [!Method]\n' +
    '> Casse et accents indifférents.\n' +
    '\n' +
    '> [!À retenir]\n' +
    '> Mot-clé français : il s’affiche comme [!KEYPOINT].\n' +
    '\n' +
    '> [!TIP]\n' +
    '> Mot-clé d’une alerte GitHub : il s’affiche en méthode.\n' +
    '\n' +
    '> [!ASTUCE]\n' +
    '> Type inconnu : le bloc reste une simple citation.';
}
