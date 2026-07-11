import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { MARKDOWN_EXTENSIONS } from './markdown-extension.model';
import { GEOGEBRA_EXTENSION } from './geogebra/geogebra-extension';
import { JSXGRAPH_EXTENSION } from './jsxgraph/jsxgraph-extension';

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
  ]);
}
