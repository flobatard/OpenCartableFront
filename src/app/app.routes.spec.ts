import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';
import { provideTranslocoTesting } from './testing/transloco-testing';
import { serverRoutes } from './app.routes.server';

/**
 * Résolution des routes élèves — l'arbre public mélange des **pages pleines**
 * (`modules/:moduleId`, `resources/:resourceId`, et la redirection de
 * l'ancienne page `exercises/:blockId`) et les **onglets** de la coquille
 * (`modules`, `resources`, `content`), sous des chemins volontairement
 * voisins. L'ordre de déclaration est donc un invariant : ces tests le
 * gardent contre toute réorganisation.
 */
describe('routes élèves', () => {
  /** Un seul TestBed par test, même quand un test résout plusieurs URL. */
  let instance: Router | null = null;

  beforeEach(() => (instance = null));

  function router(): Router {
    if (instance === null) {
      // `langGuard` s'exécute à la navigation : il lui faut Transloco.
      TestBed.configureTestingModule({
        imports: [provideTranslocoTesting()],
        providers: [provideRouter(routes)],
      });
      instance = TestBed.inject(Router);
    }
    return instance;
  }

  /** Chaîne des `path` de config traversés, du :lang à la feuille. */
  async function resolve(url: string): Promise<string[]> {
    const r = router();
    await r.navigateByUrl(url);
    const chain: string[] = [];
    let node: ActivatedRouteSnapshot | null = r.routerState.snapshot.root.firstChild;
    while (node !== null) {
      chain.push(node.routeConfig?.path ?? '');
      node = node.firstChild;
    }
    return chain;
  }

  it.each([
    // Onglets : enfants de la coquille (chemin vide) — un segment.
    ['/fr/p/courses/c1', ['p/courses/:courseId', '', '']],
    ['/fr/p/courses/c1/resources', ['p/courses/:courseId', '', 'resources']],
    ['/fr/p/courses/c1/modules', ['p/courses/:courseId', '', 'modules']],
    ['/fr/p/courses/c1/content', ['p/courses/:courseId', '', 'content']],
    ['/fr/p/courses/c1/blocks/b1', ['p/courses/:courseId', '', 'blocks/:blockId']],
    // Pages pleines : sœurs de la coquille — deux segments, déclarées avant.
    ['/fr/p/courses/c1/modules/m1', ['p/courses/:courseId', 'modules/:moduleId']],
    ['/fr/p/courses/c1/resources/r1', ['p/courses/:courseId', 'resources/:resourceId']],
    // Ancienne page pleine d'exercice : redirigée vers le bloc seul, sous la coquille.
    ['/fr/p/courses/c1/exercises/b1', ['p/courses/:courseId', '', 'blocks/:blockId']],
  ])('resolves %s to the right route', async (url, expected) => {
    expect((await resolve(url)).slice(1)).toEqual(expected);
  });

  it('redirects the retired exercise page to the block where the exercise is solved', async () => {
    // Les liens `exercises/:blockId` déjà partagés (J2) restent valides : URL
    // réécrite vers le bloc, dans le même régime d'accès.
    expect((await resolve('/fr/shared/tok/exercises/b1')).slice(1)).toEqual([
      'shared/:token',
      '',
      'blocks/:blockId',
    ]);
    expect(router().url).toBe('/fr/shared/tok/blocks/b1');
  });

  it('redirects the docs entry without slug to the first page, client-side', async () => {
    // Même motif (redirectTo en fonction) : en chaîne, @angular/ssr répondait
    // un 302 mal résolu (`/fr/markdown-language/markdown-language/docs/katex`).
    await resolve('/fr/markdown-language/docs');
    expect(router().url).toBe('/fr/markdown-language/docs/katex');
  });

  it('resolves the same tree behind a share link', async () => {
    expect((await resolve('/fr/shared/tok/modules')).slice(1)).toEqual([
      'shared/:token',
      '',
      'modules',
    ]);
    expect((await resolve('/fr/shared/tok/modules/m1')).slice(1)).toEqual([
      'shared/:token',
      'modules/:moduleId',
    ]);
  });

  it('declares every student route as client-rendered', () => {
    // DOMPurify sans `window` renverrait du HTML NON filtré : aucune de ces
    // routes ne doit retomber dans le catch-all Server.
    const clientPaths = new Set(
      serverRoutes.filter((r) => r.renderMode === 1 /* RenderMode.Client */).map((r) => r.path),
    );
    for (const base of [':lang/shared/:token', ':lang/p/courses/:courseId']) {
      for (const sub of [
        '',
        '/resources',
        '/modules',
        '/content',
        '/blocks/:blockId',
        '/modules/:moduleId',
        '/resources/:resourceId',
        '/exercises/:blockId',
      ]) {
        expect(clientPaths).toContain(`${base}${sub}`);
      }
    }
  });
});
