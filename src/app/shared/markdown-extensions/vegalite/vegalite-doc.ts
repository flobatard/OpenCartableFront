import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../markdown-playground/markdown-playground';
import { MarkdownView } from '../../markdown-view/markdown-view';

/**
 * Page de documentation du langage ```vegalite — montée par DocsShell (slug
 * `vegalite`, cf. VEGALITE_EXTENSION.doc). Prose via i18n `docs.vegalite.*`.
 */
@Component({
  selector: 'app-vegalite-doc',
  imports: [MarkdownPlayground, MarkdownView, TranslocoPipe],
  templateUrl: './vegalite-doc.html',
})
export class VegaliteDoc {
  protected readonly firstExample = `\`\`\`vegalite
{
  "description": "Population des plus grandes villes de France",
  "data": {"values": [
    {"ville": "Paris", "habitants": 2.1},
    {"ville": "Marseille", "habitants": 0.87},
    {"ville": "Lyon", "habitants": 0.52},
    {"ville": "Toulouse", "habitants": 0.5}
  ]},
  "mark": "bar",
  "encoding": {
    "x": {"field": "ville", "type": "nominal", "sort": "-y", "title": null},
    "y": {"field": "habitants", "type": "quantitative", "title": "Millions d'habitants"}
  }
}
\`\`\``;

  protected readonly measuresExample = `\`\`\`vegalite
{
  "title": "Chute libre : vitesse en fonction du temps",
  "data": {"values": [
    {"t": 0, "v": 0}, {"t": 0.5, "v": 5.1}, {"t": 1, "v": 9.6},
    {"t": 1.5, "v": 14.9}, {"t": 2, "v": 19.8}, {"t": 2.5, "v": 24.3}
  ]},
  "encoding": {
    "x": {"field": "t", "type": "quantitative", "title": "t (s)"},
    "y": {"field": "v", "type": "quantitative", "title": "v (m/s)"}
  },
  "layer": [
    {"mark": {"type": "point", "filled": true}},
    {"mark": {"type": "line", "color": "firebrick"}, "transform": [{"regression": "v", "on": "t"}]}
  ]
}
\`\`\``;

  protected readonly layersExample = `\`\`\`vegalite
{
  "title": "Climat de Brest (valeurs indicatives)",
  "data": {"values": [
    {"n": 1, "mois": "Jan", "temp": 7.1, "pluie": 120}, {"n": 2, "mois": "Fév", "temp": 7.0, "pluie": 93},
    {"n": 3, "mois": "Mar", "temp": 8.6, "pluie": 82}, {"n": 4, "mois": "Avr", "temp": 10.0, "pluie": 74},
    {"n": 5, "mois": "Mai", "temp": 12.9, "pluie": 70}, {"n": 6, "mois": "Juin", "temp": 15.4, "pluie": 51},
    {"n": 7, "mois": "Juil", "temp": 17.3, "pluie": 54}, {"n": 8, "mois": "Août", "temp": 17.5, "pluie": 61},
    {"n": 9, "mois": "Sep", "temp": 15.8, "pluie": 78}, {"n": 10, "mois": "Oct", "temp": 12.9, "pluie": 112},
    {"n": 11, "mois": "Nov", "temp": 9.9, "pluie": 118}, {"n": 12, "mois": "Déc", "temp": 7.9, "pluie": 130}
  ]},
  "encoding": {"x": {"field": "mois", "type": "ordinal", "sort": {"field": "n"}, "title": null}},
  "layer": [
    {"mark": {"type": "bar", "color": "steelblue"},
     "encoding": {"y": {"field": "pluie", "type": "quantitative", "title": "Précipitations (mm)"}}},
    {"mark": {"type": "line", "color": "firebrick", "point": true},
     "encoding": {"y": {"field": "temp", "type": "quantitative", "title": "Température (°C)"}}}
  ],
  "resolve": {"scale": {"y": "independent"}}
}
\`\`\``;

  protected readonly errorExample = `\`\`\`vegalite
{"data": {"url": "https://exemple.fr/donnees.csv"}, "mark": "bar"}
\`\`\``;
}
