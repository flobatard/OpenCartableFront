import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { MARKDOWN_EXTENSIONS } from './markdown-extension.model';
import { ABC_EXTENSION } from './abc/abc-extension';
import { GEOGEBRA_EXTENSION } from './geogebra/geogebra-extension';
import { JSXGRAPH_EXTENSION } from './jsxgraph/jsxgraph-extension';
import { SMILES_EXTENSION } from './smiles/smiles-extension';
import { TIKZ_EXTENSION } from './tikz/tikz-extension';
import { TIMELINE_EXTENSION } from './timeline/timeline-extension';
import { VEGALITE_EXTENSION } from './vegalite/vegalite-extension';

/**
 * Enregistre les langages d'extension markdown de l'application (consommé par
 * app.config.ts). Ajouter un langage = son dossier dans markdown-extensions/
 * + une entrée ici. Les defs n'importent JAMAIS leur composant statiquement
 * (`loadComponent` lazy) : rien n'entre dans le bundle initial.
 */
export function provideMarkdownExtensions(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: MARKDOWN_EXTENSIONS, useValue: GEOGEBRA_EXTENSION, multi: true },
    { provide: MARKDOWN_EXTENSIONS, useValue: JSXGRAPH_EXTENSION, multi: true },
    { provide: MARKDOWN_EXTENSIONS, useValue: TIKZ_EXTENSION, multi: true },
    { provide: MARKDOWN_EXTENSIONS, useValue: TIMELINE_EXTENSION, multi: true },
    { provide: MARKDOWN_EXTENSIONS, useValue: SMILES_EXTENSION, multi: true },
    { provide: MARKDOWN_EXTENSIONS, useValue: VEGALITE_EXTENSION, multi: true },
    { provide: MARKDOWN_EXTENSIONS, useValue: ABC_EXTENSION, multi: true },
  ]);
}
