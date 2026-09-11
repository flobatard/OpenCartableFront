import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../markdown-playground/markdown-playground';
import { MarkdownView } from '../../markdown-view/markdown-view';

/**
 * Page complémentaire de TikZ (slug `tikz-circuits`) : schémas électriques
 * avec les bibliothèques `circuits.ee.IEC` et `circuits.logic.*` du TikZJax
 * embarqué (pas circuitikz). Prose via i18n `docs.tikzCircuits.*` ; sources
 * d'exemples en constantes non traduites (c'est de la syntaxe), toutes
 * compilées en navigateur. La galerie des symboles est rendue en statique,
 * pleine largeur : dans la colonne d'aperçu d'un playground ses libellés
 * seraient illisibles.
 */
@Component({
  selector: 'app-tikz-circuits-doc',
  imports: [MarkdownPlayground, MarkdownView, TranslocoPipe],
  templateUrl: './tikz-circuits-doc.html',
})
export class TikzCircuitsDoc {
  /** Symboles dipôles de `circuits.ee.IEC`, dans l'ordre de la galerie ; libellé i18n par clé. */
  protected readonly symbols = [
    { code: 'resistor', key: 'resistor' },
    { code: 'bulb', key: 'bulb' },
    { code: 'battery', key: 'battery' },
    { code: 'dc source', key: 'dcSource' },
    { code: 'ac source', key: 'acSource' },
    { code: 'voltage source', key: 'voltageSource' },
    { code: 'current source', key: 'currentSource' },
    { code: 'capacitor', key: 'capacitor' },
    { code: 'inductor', key: 'inductor' },
    { code: 'diode', key: 'diode' },
    { code: 'Zener diode', key: 'zenerDiode' },
    { code: 'make contact', key: 'makeContact' },
    { code: 'break contact', key: 'breakContact' },
    { code: 'amperemeter', key: 'amperemeter' },
    { code: 'voltmeter', key: 'voltmeter' },
    { code: 'ohmmeter', key: 'ohmmeter' },
  ] as const;

  protected readonly firstExample = `\`\`\`tikz
\\usetikzlibrary{circuits.ee.IEC}
\\begin{tikzpicture}[circuit ee IEC]
  % Chaque dipôle se pose sur un segment : to [symbole]
  \\draw (0,0) to [battery={info={$E$}}] (0,3)
              to [make contact={info={$K$}}] (3,3)
              to [bulb={info={$L$}}] (6,3)
              to [resistor={info={$R$}}] (6,0)
              -- (0,0);
\\end{tikzpicture}
\`\`\``;

  protected readonly symbolsExample = `\`\`\`tikz
\\usetikzlibrary{circuits.ee.IEC}
\\begin{tikzpicture}[circuit ee IEC, every info/.style={font=\\footnotesize}]
  \\draw (0,0) to [resistor={info=resistor}] (3,0);
  \\draw (4,0) to [bulb={info=bulb}] (7,0);
  \\draw (8,0) to [battery={info=battery}] (11,0);
  \\draw (12,0) to [dc source={info=dc source}] (15,0);

  \\draw (0,-2) to [ac source={info=ac source}] (3,-2);
  \\draw (4,-2) to [voltage source={info=voltage source}] (7,-2);
  \\draw (8,-2) to [current source={info=current source}] (11,-2);
  \\draw (12,-2) to [capacitor={info=capacitor}] (15,-2);

  \\draw (0,-4) to [inductor={info=inductor}] (3,-4);
  \\draw (4,-4) to [diode={info=diode}] (7,-4);
  \\draw (8,-4) to [Zener diode={info=Zener diode}] (11,-4);
  \\draw (12,-4) to [make contact={info=make contact}] (15,-4);

  \\draw (0,-6) to [break contact={info=break contact}] (3,-6);
  \\draw (4,-6) to [amperemeter={info=amperemeter}] (7,-6);
  \\draw (8,-6) to [voltmeter={info=voltmeter}] (11,-6);
  \\draw (12,-6) to [ohmmeter={info=ohmmeter}] (15,-6);
\\end{tikzpicture}
\`\`\``;

  protected readonly valuesExample = `\`\`\`tikz
\\usetikzlibrary{circuits.ee.IEC}
\\begin{tikzpicture}[circuit ee IEC]
  % Maille principale : générateur, ampèremètre en série, résistance
  \\draw (0,0) to [dc source={volt=12}] (0,3)
              to [amperemeter] (4,3)
              to [resistor={ohm=100}] (4,0)
              to [current direction={info=$I$}] (0,0);
  % Voltmètre en dérivation aux bornes de la résistance
  \\draw (4,3) -- (7,3) to [voltmeter={info=$U_R$}] (7,0) -- (4,0);
  % Nœuds de connexion
  \\node [contact] at (4,3) {};
  \\node [contact] at (4,0) {};
\\end{tikzpicture}
\`\`\``;

  protected readonly variantsExample = `\`\`\`tikz
\\usetikzlibrary{circuits.ee.IEC}
\\begin{tikzpicture}[circuit ee IEC]
  \\draw (0,0) to [battery={volt=6}] (0,3)
              to [resistor={adjustable, info'={[label distance=3mm]rheostat}}] (4,3)
              to [diode={light emitting, info'=DEL}] (4,0)
              to [resistor={light dependent, info'=LDR}] (0,0);
  % Masse (symbole tourné pour pointer vers le bas)
  \\draw (0,0) -- (0,-0.8) node [ground, rotate=-90] {};
\\end{tikzpicture}
\`\`\``;

  protected readonly logicExample = `\`\`\`tikz
\\usetikzlibrary{circuits.logic.US}
\\begin{tikzpicture}[circuit logic US]
  % Demi-additionneur : S = A xor B, C = A and B
  \\node [xor gate, inputs=nn] (x) at (3,1) {};
  \\node [and gate, inputs=nn] (a) at (3,-1) {};
  \\draw (0,0.5) node [left] {$A$} -- (1,0.5);
  \\draw (0,-0.5) node [left] {$B$} -- (1.6,-0.5);
  \\draw (1,0.5) |- (x.input 1);
  \\draw (1,0.5) |- (a.input 1);
  \\draw (1.6,-0.5) |- (x.input 2);
  \\draw (1.6,-0.5) |- (a.input 2);
  \\fill (1,0.5) circle (1.5pt) (1.6,-0.5) circle (1.5pt);
  \\draw (x.output) -- ++(1,0) node [right] {$S$};
  \\draw (a.output) -- ++(1,0) node [right] {$C$};
\\end{tikzpicture}
\`\`\``;
}
