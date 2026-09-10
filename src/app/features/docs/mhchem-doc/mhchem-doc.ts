import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../../shared/markdown-playground/markdown-playground';
import { MarkdownView } from '../../../shared/markdown-view/markdown-view';

/**
 * Page de documentation de la notation chimique (extension mhchem de KaTeX) —
 * montée par DocsShell (slug `mhchem`). Ce n'est pas un fence : `\ce{…}` et
 * `\pu{…}` s'écrivent dans une formule `$…$`. Prose via i18n `docs.mhchem.*` ;
 * sources d'exemples en constantes non traduites (c'est de la syntaxe).
 */
@Component({
  selector: 'app-mhchem-doc',
  imports: [MarkdownPlayground, MarkdownView, TranslocoPipe],
  templateUrl: './mhchem-doc.html',
})
export class MhchemDoc {
  protected readonly firstExample =
    'La combustion du dihydrogène : $\\ce{2H2 + O2 -> 2H2O}$.\n' +
    '\n' +
    '$$\\ce{CH4 + 2O2 -> CO2 + 2H2O}$$';

  protected readonly speciesExample =
    'Ions : $\\ce{Cu^2+}$, $\\ce{SO4^2-}$, $\\ce{H3O+}$\n' +
    '\n' +
    'États physiques : $\\ce{H2O(l)}$, $\\ce{CO2(g)}$, $\\ce{NaCl(aq)}$, $\\ce{Fe(s)}$\n' +
    '\n' +
    'Hydrate : $\\ce{CuSO4.5H2O}$ — noyaux : $\\ce{^{14}_{6}C}$, $\\ce{^{235}_{92}U}$';

  protected readonly arrowsExample =
    '$$\\ce{CH3COOH + H2O <=> CH3COO- + H3O+}$$\n' +
    '\n' +
    '$\\ce{A -> B}$, $\\ce{A <- B}$, $\\ce{A <-> B}$, $\\ce{A ->[{catalyseur}] B}$\n' +
    '\n' +
    'Précipité et dégagement : $\\ce{Fe^{3+} + 3OH- -> Fe(OH)3 v}$, $\\ce{CaCO3 -> CaO + CO2 ^}$';

  protected readonly unitsExample =
    '$g = \\pu{9.81 m.s^-2}$, $e = \\pu{1.6e-19 C}$, $\\pu{25 °C}$, $\\pu{123 kJ/mol}$';

  protected readonly errorExample = 'Écrit hors dollars, \\ce{H2O} reste du texte brut.';
}
