import { CanActivateFn, Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import {
  COURSE_MODULE_RESOLVER,
  COURSE_RESOURCE_RESOLVER,
} from './core/course-content/course-content-resolvers';
import { langGuard } from './core/i18n/lang.guard';
import { rootLangRedirect } from './core/i18n/root-redirect';
import {
  PublicModuleResolver,
  PublicResourceResolver,
} from './core/public-courses/public-content-resolvers';
import { onboardingGuard } from './core/users/onboarding.guard';

/**
 * Guards de l'espace prof — **dans cet ordre** : `onboardingGuard` laisse
 * passer les non-authentifiés, c'est `authGuard` qui les renvoie au login.
 * Toute route sous ces guards est en `RenderMode.Client` (le guard renvoie
 * `false` au serveur — jamais authentifiée au SSR, donc jamais prerendable),
 * cf. `app.routes.server.ts`.
 */
const TEACHER_GUARDS: CanActivateFn[] = [authGuard, onboardingGuard];

/**
 * Providers des sous-arbres élèves : substituent les résolveurs publics
 * (endpoints /v1/public/*, sans Bearer) aux impl. prof par défaut dans les
 * composants de rendu partagés (markdown-view, module-embed, …).
 */
const PUBLIC_CONTENT_PROVIDERS = [
  PublicResourceResolver,
  PublicModuleResolver,
  { provide: COURSE_RESOURCE_RESOLVER, useExisting: PublicResourceResolver },
  { provide: COURSE_MODULE_RESOLVER, useExisting: PublicModuleResolver },
];

/**
 * Enfants d'un cours élève, identiques dans les deux régimes d'accès (lien de
 * partage et cours public) — c'est le `data.access` du parent qui les
 * distingue. Deux familles :
 *
 * - les **pages pleines**, déclarées d'abord : module dédié (démonstration
 *   d'un module seul) et redirection de ressource. Elles n'ont ni en-tête ni
 *   onglets, chargent le cours elles-mêmes et sont partageables telles
 *   quelles. S'y range aussi la **redirection** de l'ancienne page pleine
 *   d'exercice (`exercises/:blockId`) vers le bloc seul, où l'exercice se
 *   résout ;
 * - la **coquille à onglets** (`path: ''`, `StudentCourse`) et ses enfants, un
 *   par onglet — Sommaire (défaut) | Ressources | Modules | Cours entier —, le
 *   bloc seul vivant sous l'onglet Sommaire. **Une route par onglet** : l'état
 *   de navigation est dans le chemin, pas en query param.
 *
 * L'ordre compte : les pages pleines portent toutes deux segments, la coquille
 * un chemin vide — déclarer les premières avant elle évite toute ambiguïté
 * entre `modules/:moduleId` (page dédiée) et `modules` (onglet). Gardé par
 * `app.routes.spec.ts`.
 */
const PUBLIC_COURSE_CHILDREN: Routes = [
  {
    // Ancienne page pleine « Résoudre l'exercice » : l'exercice se résout dans
    // le bloc seul — les liens déjà partagés restent valides. Fonction et non
    // chaîne : @angular/ssr résout un `redirectTo` chaîne relatif en ne
    // retirant que le dernier segment du chemin de la route (302 vers
    // `/…/exercises/blocks/:blockId`, cassé), alors qu'une fonction est
    // laissée au routeur navigateur (route servie en CSR).
    path: 'exercises/:blockId',
    redirectTo: ({ params }) => `blocks/${params['blockId']}`,
  },
  {
    // Page dédiée d'un module interactif : le prof y renvoie pour démontrer
    // un module seul, sans le reste du cours.
    path: 'modules/:moduleId',
    loadComponent: () =>
      import('./features/student/student-module/student-module').then((m) => m.StudentModule),
  },
  {
    // Cible des liens de ressource des PDF exportés côté élève : présigne
    // sans Bearer puis redirige vers l'URL S3 inline.
    path: 'resources/:resourceId',
    loadComponent: () =>
      import('./features/student/student-resource-view/student-resource-view').then(
        (m) => m.StudentResourceView,
      ),
  },
  {
    path: '',
    loadComponent: () =>
      import('./features/student/student-course/student-course').then((m) => m.StudentCourse),
    children: [
      {
        path: '',
        pathMatch: 'full' as const,
        loadComponent: () =>
          import('./features/student/student-summary/student-summary').then(
            (m) => m.StudentSummary,
          ),
      },
      {
        // Bloc seul, sous l'onglet Sommaire (qui reste l'onglet actif).
        path: 'blocks/:blockId',
        loadComponent: () =>
          import('./features/student/student-block/student-block').then((m) => m.StudentBlock),
      },
      {
        path: 'resources',
        loadComponent: () =>
          import('./features/student/student-resources/student-resources').then(
            (m) => m.StudentResources,
          ),
      },
      {
        path: 'modules',
        loadComponent: () =>
          import('./features/student/student-modules/student-modules').then(
            (m) => m.StudentModules,
          ),
      },
      {
        path: 'content',
        loadComponent: () =>
          import('./features/student/student-content/student-content').then(
            (m) => m.StudentContent,
          ),
      },
    ],
  },
];

export const routes: Routes = [
  {
    // Redirige vers /<lang>/home selon la préférence stockée puis la langue du navigateur.
    path: '',
    pathMatch: 'full',
    redirectTo: () => rootLangRedirect(),
  },
  {
    // Le callback OIDC reste hors du préfixe de langue (URI de redirection = /auth/callback).
    path: 'auth/callback',
    loadComponent: () => import('./features/auth/auth-callback').then((m) => m.AuthCallback),
  },
  {
    path: ':lang',
    canActivate: [langGuard],
    // Réexécute le guard (donc réactive la langue) au changement de segment fr↔en.
    runGuardsAndResolvers: 'pathParamsChange',
    children: [
      {
        path: 'home',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
      },
      {
        // Documentation publique des langages du markdown de cours : l'entrée
        // sans slug retombe sur la première page (KaTeX). Fonction et non
        // chaîne (cf. `exercises/:blockId`) : en chaîne, @angular/ssr répondait
        // un 302 vers `/fr/markdown-language/markdown-language/docs/katex`.
        path: 'markdown-language/docs',
        pathMatch: 'full',
        redirectTo: () => 'markdown-language/docs/katex',
      },
      {
        // Coquille à onglets ; le composant de doc du slug est monté dynamiquement.
        path: 'markdown-language/docs/:slug',
        loadComponent: () =>
          import('./features/docs/docs-shell/docs-shell').then((m) => m.DocsShell),
      },
      {
        // Vue élève d'un cours partagé par LIEN : token opaque dans l'URL,
        // aucune auth — les guards prof n'ont rien à faire ici.
        path: 'shared/:token',
        data: { access: 'token' },
        providers: PUBLIC_CONTENT_PROVIDERS,
        children: PUBLIC_COURSE_CHILDREN,
      },
      {
        // Vue élève d'un cours PUBLIC : accès direct par id, sans token.
        // Déclaré avant `p/:teacherId` : `courses` doit matcher le segment
        // littéral, pas un id de prof (convention `courses/new`).
        path: 'p/courses/:courseId',
        data: { access: 'public' },
        providers: PUBLIC_CONTENT_PROVIDERS,
        children: PUBLIC_COURSE_CHILDREN,
      },
      {
        // Catalogue public d'un prof : ses cours `public` uniquement.
        path: 'p/:teacherId',
        loadComponent: () =>
          import('./features/student/student-catalog/student-catalog').then(
            (m) => m.StudentCatalog,
          ),
      },
      {
        // Recherche publique : cours publics et profs opt-in, sans compte ni
        // guard — l'état (q, onglet, facettes, page) vit dans les query params.
        path: 'search',
        loadComponent: () => import('./features/search/search').then((m) => m.Search),
      },
      {
        // Réservé au prof authentifié ; jamais rendu authentifié au serveur (cf. authGuard).
        path: 'subjects',
        canActivate: TEACHER_GUARDS,
        loadComponent: () => import('./features/subjects/subjects').then((m) => m.Subjects),
      },
      {
        // Onboarding bloquant post-login. PAS d'onboardingGuard ici (boucle) :
        // le composant redirige lui-même si le profil est déjà complet.
        path: 'onboarding',
        canActivate: [authGuard],
        loadComponent: () => import('./features/onboarding/onboarding').then((m) => m.Onboarding),
      },
      {
        // Hub « Paramètres » : coquille à menu latéral, sous-pages enfants
        // (profil, réglages IA). Guards sur le parent.
        path: 'settings',
        canActivate: TEACHER_GUARDS,
        loadComponent: () =>
          import('./features/settings/settings-shell/settings-shell').then(
            (m) => m.SettingsShell,
          ),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'profile' },
          {
            path: 'profile',
            loadComponent: () => import('./features/profile/profile').then((m) => m.Profile),
          },
          {
            // Credential IA de l'utilisateur (provider/modèle/clé chiffrée).
            path: 'ai',
            loadComponent: () =>
              import('./features/settings/ai-settings/ai-settings').then((m) => m.AiSettings),
          },
        ],
      },
      {
        // Ancienne URL du profil (favoris) : redirection vers le hub.
        path: 'profile',
        redirectTo: 'settings/profile',
      },
      {
        // Espace prof « Mes cours » : liste des cours, entrée vers création et blocs.
        path: 'courses',
        canActivate: TEACHER_GUARDS,
        loadComponent: () =>
          import('./features/courses/course-list/course-list').then((m) => m.CourseList),
      },
      {
        // Déclaré avant `courses/:id` : « new » doit matcher le segment littéral.
        path: 'courses/new',
        canActivate: TEACHER_GUARDS,
        loadComponent: () =>
          import('./features/courses/course-create/course-create').then((m) => m.CourseCreate),
      },
      {
        // Page cours à onglets (blocs, ressources, modules, aperçu, partage).
        path: 'courses/:id',
        canActivate: TEACHER_GUARDS,
        loadComponent: () =>
          import('./features/courses/course-blocks/course-blocks').then((m) => m.CourseBlocks),
      },
      {
        // Éditeur d'un bloc (texte, exercice, document, module — Monaco charge
        // au navigateur). Params en snapshot → remontage forcé quand blockId
        // change (une citation oc-block: de l'assistant peut naviguer d'un
        // éditeur de bloc à un autre).
        path: 'courses/:id/blocks/:blockId',
        canActivate: TEACHER_GUARDS,
        data: { remountOnParamChange: true },
        loadComponent: () =>
          import('./features/courses/block-editor/block-editor').then((m) => m.BlockEditor),
      },
      {
        // Éditeur d'un module interactif (3 Monaco HTML/CSS/JS + preview
        // sandbox — charge au navigateur). Params en snapshot → remontage
        // forcé quand moduleId change (comme l'éditeur de bloc).
        path: 'courses/:id/modules/:moduleId',
        canActivate: TEACHER_GUARDS,
        data: { remountOnParamChange: true },
        loadComponent: () =>
          import('./features/courses/module-editor/module-editor').then((m) => m.ModuleEditor),
      },
      {
        // Cible des liens de ressource des PDF exportés : présigne (authentifié)
        // puis redirige le navigateur vers l'URL S3 inline.
        path: 'courses/:id/resources/:resourceId',
        canActivate: TEACHER_GUARDS,
        loadComponent: () =>
          import('./features/courses/resource-view/resource-view').then((m) => m.ResourceView),
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'home',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'fr/home',
  },
];
