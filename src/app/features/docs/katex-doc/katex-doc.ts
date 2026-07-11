import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../../shared/markdown-playground/markdown-playground';
import { MarkdownView } from '../../../shared/markdown-view/markdown-view';

/**
 * Page de documentation des formules mathématiques (KaTeX) — montée par
 * DocsShell (slug `katex`). Prose via i18n `docs.katex.*` ; les sources
 * d'exemples sont des constantes non traduites (c'est de la syntaxe),
 * volontairement pauvres en prose. Client-only (playgrounds Monaco).
 */
@Component({
  selector: 'app-katex-doc',
  imports: [MarkdownPlayground, MarkdownView, TranslocoPipe],
  templateUrl: './katex-doc.html',
})
export class KatexDoc {
  protected readonly delimitersExample =
    'La solution positive de $x^2 = 2$ est $x = \\sqrt{2}$.\n' +
    '\n' +
    '$$\n' +
    'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\n' +
    '$$\n' +
    '\n' +
    'Prix : 10$ et 20$ (texte — pas une formule).\n' +
    '\n' +
    'Dollar littéral : \\$5';

  protected readonly basicsExample =
    '$\\frac{a}{b}$ et $\\dfrac{a}{b}$\n' +
    '\n' +
    '$x^2$, $x_i$, $x_i^2$, $x^{10}$\n' +
    '\n' +
    '$\\sqrt{x}$, $\\sqrt[3]{x}$';

  protected readonly operatorsExample =
    '$$\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$$\n' +
    '\n' +
    '$$\\int_0^1 x^2 \\, dx = \\frac{1}{3}$$\n' +
    '\n' +
    '$$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1 \\qquad \\prod_{i=1}^{n} a_i$$';

  protected readonly symbolsExample =
    '$\\alpha, \\beta, \\gamma, \\delta, \\pi, \\theta, \\lambda, \\mu, \\sigma, \\omega, \\Omega$\n' +
    '\n' +
    '$x \\le y$, $x \\ge y$, $x \\ne y$, $x \\approx y$, $a \\times b$, $a \\cdot b$, $\\pm$, $\\infty$\n' +
    '\n' +
    '$x \\in \\mathbb{R}$, $\\mathbb{N} \\subset \\mathbb{Z}$, $A \\cup B$, $A \\cap B$, $\\rightarrow$, $\\implies$, $\\iff$';

  protected readonly matricesExample =
    '$$\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix} \\quad' +
    ' \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix} \\quad' +
    ' \\begin{vmatrix} 1 & 0 \\\\ 0 & 1 \\end{vmatrix}$$';

  protected readonly systemsExample =
    '$$|x| = \\begin{cases} x & \\text{si } x \\ge 0 \\\\ -x & \\text{sinon} \\end{cases}$$\n' +
    '\n' +
    '$$\\begin{aligned} (a+b)^2 &= a^2 + 2ab + b^2 \\\\ (a-b)^2 &= a^2 - 2ab + b^2 \\end{aligned}$$';

  protected readonly textExample =
    '$$P(A \\cap B) = P(A) \\, P(B) \\quad \\text{si } A \\text{ et } B \\text{ indépendants}$$';

  protected readonly errorExample = 'Formule invalide : $\\frac{1}{$ (délimiteur non fermé).';
}
