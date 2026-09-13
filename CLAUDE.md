# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Front Angular 22 d'**OpenCartable** (zoneless, SSR + prerender, Transloco fr/en, OIDC Code + PKCE vers Zitadel) : un prof authentifié compose des cours par blocs et les partage à ses élèves par liens publics, sans compte ; un élève connecté dispose d'un tuteur IA. Cadrage produit : `Descriptions.md` (fait foi). Design system : `DESIGN_SYSTEM.md` (source de vérité UI). Historique des jalons : `../docs/milestones.md` ; décisions encore contraignantes : `../docs/decisions.md` ; dettes : `../TODO.md`. L'utilisateur échange en **français**.

## Commandes

Node est géré par nvm ; dans un shell non-interactif, npm n'est pas sur le PATH :

```bash
export PATH="$HOME/.nvm/versions/node/v26.3.0/bin:$PATH"
```

```bash
npm install                            # postinstall : librairies des modules (.module-libs/), runtimes TikZJax (.tikzjax/) et Pyodide + wheels numpy/matplotlib (.pyodide/, réseau requis — OC_SKIP_PYODIDE_PACKAGES=1 pour sauter les wheels), gitignorés
npm start                              # dev server (4200)
npm run build                          # build prod + prerender de /fr/home et /en/home
npm run watch                          # build dev en continu
npm test                               # vitest (jsdom), toute la suite
npm test -- --include src/app/core/theme/theme.service.spec.ts   # un seul fichier (chemin de spec, jamais un glob de dossier)
npm test -- --filter "ThemeService"    # par nom de suite/test
npm run serve:ssr:OpenCartableFront    # sert dist/ via Express (4000)
docker compose up --build              # conteneur SSR (4000)
```

- Après tout changement touchant SSR/i18n/prerender, vérifier que `dist/OpenCartableFront/browser/fr/home/index.html` contient le texte français rendu (chaînes vides = régression du préchargement Transloco).
- Toute modification d'`angular.json` ou d'un `scripts/prepare-*.mjs` exige un redémarrage de `ng serve` (sinon 302 SPA sur les assets).
- Les en-têtes de `static-headers.ts` (CSP des workers, `no-cache` des runtimes) ne s'observent que sous `npm run serve:ssr:OpenCartableFront`, jamais sous `ng serve`.
- Le repo n'est pas entièrement formaté Prettier : ne jamais lancer `prettier --write` sur un fichier existant.

## Carte de `src/app/`

| Dossier | Contenu |
|---|---|
| `core/` | Services de données et helpers purs, un dossier par ressource (`courses/`, `resources/`, `modules/`, `share/`, `users/`, `subjects/`, `education-levels/`, `search/`, `public-courses/`, `ai-credentials/`, `student/`) ; `auth/` (OIDC + guard), `i18n/`, `theme/`, `seo/`, `notifications/`, `routing/` (stratégie de remontage), `course-content/` (tokens de résolveurs prof/élève), `markdown/` (pipeline de rendu et sanitisation), `course-assistant/` (état du chat, API, réducteur de tour, client SSE, propositions), `editing/` (`armedAction`, `createAutosave`), `consent/` et `analytics/` (consentement et mesure d'audience) |
| `shared/` | Composants et directives transverses : `markdown-editor/` (Monaco), `markdown-view/`, `markdown-field/`, `markdown-extensions/`, `module-runner/` (sandbox), `course-blocks-view/` (rendu prof et élève), `print/` (PDF), `export-html/` (page HTML autonome) et `export-dialog/` (choix du format), `dialog/` (`ocDialog`), `tabs/` (`ocTablist`), `resize-handle/` (`ocResizeHandle`), `block-citations/` (`ocBlockCitations`), pickers et modales |
| `features/` | Pages par domaine : `home/`, `auth/`, `onboarding/`, `profile/`, `settings/`, `subjects/`, `courses/` (liste, création, page cours à onglets, éditeurs de bloc et de module), `course-assistant/` (chat, panneau flottant, revues de proposition), `student/` (pages élèves), `search/`, `docs/`, `privacy/` (politique de confidentialité) |
| `layout/` | Header (menu utilisateur), footer et `consent-banner/` (bandeau de consentement + modale de préférences) |
| `i18n/{fr,en}/` | Un JSON par domaine, réassemblés par `index.ts` (un chunk par langue) |
| `testing/` | Fixtures et mocks partagés : `service-mocks.ts`, `assistant.fixture.ts`, `sse.fixture.ts`, `transloco-testing.ts`, fixtures de données |

Routes : `app.routes.ts` (guards prof `TEACHER_GUARDS`, sous-arbres élèves `PUBLIC_COURSE_CHILDREN`) et `app.routes.server.ts` (mode de rendu par chemin). Environnements : `src/environments/` (`environment.model.ts` jamais remplacé ; les autres par `fileReplacements`).

## Invariants

**Rendu et routes**
- Zoneless : tout état partagé est un signal, les souscriptions rxjs écrivent dans des signaux. Jamais `provideZoneChangeDetection`.
- Trois modes de rendu (`app.routes.server.ts`) : home prerendue, tout ce qui touche `window`/`localStorage`, Monaco, DOMPurify ou un guard prof en `RenderMode.Client` **explicite**, le reste en SSR. Une route sous `authGuard` est toujours Client (le guard renvoie `false` au serveur). DOMPurify sans `window` renvoie du HTML NON filtré : les pages élèves sont toutes Client.
- `redirectTo` en **fonction**, jamais en chaîne relative (`@angular/ssr` répond un 302 cassé).
- `RouteReuseStrategy` (`core/routing/`) : les deux éditeurs (`data.remountOnParamChange`) sont détruits et remontés quand leurs params changent — ils lisent leurs params en snapshot, et une citation `oc-block:` peut naviguer d'un éditeur à l'autre. Les composants qui observent leur `paramMap` (`DocsShell`, `StudentBlock`) ne posent pas le flag.
- Pages élèves : jamais de Bearer (`customUrlValidation` d'`app.config.ts` exclut `/v1/public/`), aucun query param (l'état vit dans le chemin), ordre des enfants de `PUBLIC_COURSE_CHILDREN` gardé par `app.routes.spec.ts`. `features/student/` n'injecte aucun service prof : les composants de rendu partagés ne connaissent que `COURSE_RESOURCE_RESOLVER`/`COURSE_MODULE_RESOLVER`, substitués par les `providers` des routes publiques (une spec qui oublie le token échoue sur `OAuthService` — c'est le signal). Seule exception : `AuthService`/`StudentSubmissionService` pour le tuteur de l'élève connecté, sans rendu de contenu.

**Accès API**
- Patron `SubjectService` : un GET par ressource en cache `shareReplay`, état en signaux ; variantes mutables (`CourseService`, `ResourceService`, `ModuleService`…) refetchées à chaque entrée de page, patch local depuis la réponse, purge à la déconnexion ; pendants anonymes (`PublicCourseService`, `SearchService`, `Public*Service`) sans `AuthService`. Fetch côté navigateur uniquement.
- Le Bearer est attaché par l'intercepteur OIDC sous `environment.apiUrl` (qui inclut `/api`) : jamais de header manuel. Seule exception : `postSseStream` (`core/course-assistant/sse.ts`), client fetch + `ReadableStream` des flux SSE, qui pose `Authorization` depuis `AuthService.accessToken`. Le parseur tolère les événements inconnus (contrat additif avec le back).
- `AuthService` (`core/auth/`) est le **seul** importeur d'`angular-oauth2-oidc` ; init sans appel réseau au démarrage (les pages élèves ne dépendent jamais de Zitadel).
- Upload S3 direct (PUT présigné) : hors `apiUrl`, donc sans Bearer (voulu) ; `Content-Type` strictement égal au mime déclaré au presign. Import d'archive : POST `FormData` sans `Content-Type` manuel.
- Guards : `TEACHER_GUARDS = [authGuard, onboardingGuard]` dans cet ordre ; jamais `onboardingGuard` sur la route onboarding elle-même ; guard et callback fail-open si l'API profil est injoignable.

**Monaco** (`shared/markdown-editor/`)
- Servi en AMD depuis `/monaco/vs` (assets copiés au build), baseUrl absolu ; options à référence stable (le wrapper recrée l'éditeur à chaque changement de référence), langage statique par instance, thème par `setTheme` global.
- Jamais sous `@if` : masquer par `[hidden]` ou par classe (Monaco survit aux bascules d'onglet et aux revues de proposition).
- `replaceAll`/`insertAtCursor` éditent entre deux `pushUndoStop` (Ctrl-Z annule l'application d'une proposition) ; `writeValue` porte une garde anti-écho — le `setValue` du wrapper vide la pile d'annulation même à valeur identique (vérifié en vrai navigateur).
- Inerte en jsdom : les specs pilotent les `FormControl` publics (exception à la convention `protected`), jamais Monaco.

**Contenu de cours**
- LA sanitisation du HTML de cours vit dans `core/markdown/` (DOMPurify, profils html+mathMl+svg, `ADD_TAGS` semantics/annotation — jamais `annotation-xml`) ; l'unique `bypassSecurityTrustHtml` est dans `markdown-view` ; deux seuls `bypassSecurityTrustResourceUrl` (iframe GeoGebra à id validé, PDF embarqué présigné).
- Figures produites par une lib (TikZ, SMILES, Vega-Lite, ABC) : SVG re-sanitisé par DOMPurify dans le composant, planche claire `--figure-board`. Aucune requête hors origine depuis un contenu de cours : Vega-Lite refuse toute clé `url`, son loader rejette tout chargement et ses expressions passent par `vega-interpreter` (jamais `new Function`) ; la lecture ABC charge ses notes depuis `public/abcjs-soundfont/` (jamais le `soundFontUrl` par défaut d'abcjs).
- Code exécutable (```sql, ```python) : runtimes WASM servis depuis `/assets` (copiés par `angular.json`, jamais bundlés), téléchargés au premier « Exécuter » — jamais au montage —, tenus par un service root derrière une fabrique de Worker injectable, exécutés dans un Worker résiliable (délai, Arrêter). `server.ts` (`static-headers.ts`) pose `no-cache` sur ces runtimes (et sur `/assets/module-libs/`) et une CSP d'en-tête sur les scripts de worker. Worker sql.js **classique**, worker Python **module** (Pyodide chargé à l'exécution par un `import()` d'URL variable, `MPLBACKEND=Agg`, lock élagué aux paquets hébergés).
- Encadrés `> [!DEFINITION]`… (`core/markdown/course-callouts.ts`, override `blockquote` du pipeline, pas un fence) : les mots-clés canoniques sont les six types eux-mêmes, en anglais (`DEFINITION`, `KEYPOINT`, `METHOD`, `EXAMPLE`, `NOTE`, `WARNING`) — c'est la graphie que documentent l'aide, le catalogue de l'assistant et le cours d'exemple ; les mots-clés français d'origine et les alias GitHub restent reconnus. Les mots-clés sont du contenu stocké, gardé par les tests du cours d'exemple back — on en ajoute, on n'en retire ni n'en renomme jamais. Leurs titres par défaut suivent la langue de l'interface : passés par `markdown-view` (`calloutTitles`) et inclus dans sa clé de rendu.
- Le markdown stocke des références stables `oc-resource:<id>`, `oc-module:<id>`, `oc-block:<id>` (jamais une URL présignée) ; tout id est validé en forme UUID avant d'être interpolé dans une URL ou une commande de navigation.
- Sandbox des modules (`shared/module-runner/`) : `sandbox` statique **sans** `allow-same-origin`, CSP `default-src 'none'` dans le srcdoc (`MODULE_CSP`), `srcdoc` posé impérativement (jamais `[srcdoc]`), messages validés par provenance puis par forme. Librairies préinstallées (pragma `// @oc-libs: …`) : lues par le parent sous `/assets/module-libs/` et **inlinées** dans le srcdoc, jamais par une ouverture de la CSP ; composition asynchrone gardée par un compteur de génération. Le prompt `MODULE_RUNTIME` du back est le miroir de `module-document.ts`, `MODULE_LIBRARY_NAMES` celui de `MODULE_LIBRARIES` : les faire évoluer ensemble.
- Tableaux GFM : le renderer `table` de `course-markdown.ts` les enveloppe dans `div.course-table` (défilement horizontal, largeur de page jamais dépassée) — un style de tableau vise le wrapper, pas un `display: block` sur le `<table>`.
- Style de lecture : variables posées en `[style]` inline sur `.course-content`, jamais sur `:root` ; les unités sont des facteurs d'échelle (écran et papier partagent les réglages).
- Exports (`shared/print/` PDF, `shared/export-html/` page autonome, modale commune `shared/export-dialog/`) : les deux clonent le DOM rendu. **Ni l'un ni l'autre n'injecte les tokens de `core/course-content/`** — `COURSE_MODULE_RESOLVER` et `COURSE_RESOURCE_RESOLVER` sont fournis par les routes publiques, un service root recevrait l'implémentation prof et enverrait un Bearer depuis une page élève : l'appelant passe `getModule`/`resourceUrl`. `markdown-view` lit le résolveur de modules **à l'export**, par son `Injector`, jamais au montage (sinon `ModuleService → AuthService → OAuthService` entre dans tous ses hôtes). Le CSS de l'export vient du CSSOM vivant, jamais d'une feuille écrite à la main ; `EXPORT_STRIPPED_SELECTORS` est le miroir des blocs `@media print` des composants.

**Éditeurs et assistant**
- Autosave : `createAutosave` (`core/editing/autosave.ts`) — debounce puis `concatMap`, jamais `switchMap` ; payload relu à l'envoi ; init une seule fois ; flush au destroy chaîné derrière un PATCH en vol. Exercice : ids de questions réécrits après chaque save (`applyGeneratedIds`) — ils sont stables à vie côté back.
- Chats d'édition : chaque éditeur fournit sa propre instance d'`AssistantChatState` (`providers`), `configure` une fois, `setBeforeTurn` = flush d'autosave (le back lit la cible EN BASE). Le panneau global (`CourseAssistantService`) est monté une fois hors du `router-outlet` et survit aux navigations.
- HITL : à l'événement `interrupt` le flux se ferme sans `done`, la proposition attend dans `pendingProposal`, la décision rouvre un flux ; la revue remplace l'éditeur par classe (Monaco survit), masquage piloté par `review()` (jamais `pending()`) ; `ProposalHost` (`core/course-assistant/proposal-host.ts`) orchestre. Mode « Édition auto » purement front (`ProposalModeService`, interrupteur du pied des chats d'édition) : l'effect de `ProposalHost` (dep `autoAccept`, construit en contexte d'injection) applique puis accepte sans revue, une tentative par proposition, repli sur la revue en cas d'échec ; `ALWAYS_REVIEWED_KINDS` (suppression de question) est toujours revu.
- Questions de l'assistant (`ask_questions`, tous contextes) : signal `pendingQuestions` **distinct** de `pendingProposal` (jamais vu par `ProposalHost` ni l'édition auto) ; le formulaire `CourseChatQuestions` remplace le composer tant qu'il est posé (une question par étape, toutes obligatoires, croix = refus) ; `answerQuestions` suit `resumeProposal`, un 404 = questions expirées (`questionsExpired`, composer rendu) ; `openConversation` repropose un dernier appel sans tour `tool` ; `revealOnNewQuestions` déplie le chat de l'hôte ; `.chat-questions` est dans `REPLAY_MASK_SELECTOR`.

**UI et i18n**
- i18n : loader par `import()` (jamais HTTP — au prerender aucun serveur ne répond), préchargement par `provideAppInitializer`, langue persistée restaurée **après** hydratation (sinon NG0500), parité fr/en gardée par `i18n-parity.spec.ts` ; libellés métier (matières, niveaux) hors i18n ; toasts avec message déjà traduit par l'émetteur.
- Thème : `data-theme` posé par le script inline d'`index.html`, lu par `ThemeService` au bootstrap ; swaps visuels en CSS sur `[data-theme]`, jamais par binding.
- Responsive (§12 du DS) : requêtes de largeur uniquement par les mixins de `styles/_breakpoints.scss` (`@use 'breakpoints' as bp;` — `bp.mobile` ≤ 640, `bp.stacked` ≤ 900, `bp.wide`, `bp.touch`), jamais de `@media` de largeur en dur ; aucun débordement horizontal de page, une seule gouttière (`.app-main`) sur téléphone.
- Tokens CSS de `styles/_tokens.scss` (§10 du DS) : jamais de hex dans un composant ; slate-400 interdit pour du texte ; `.course-content` en AAA (`styles/_course-content.scss`) ; `styles.scss` n'utilise que `@use`.
- Ids ARIA par compteur de module (jamais `Date.now()`/`Math.random()`) ; un `viewChild` ne se pose pas sur un champ `#privé` ; pas de ref de template homonyme d'un signal.
- Réglages IA : le signal d'`AiCredentialsService` est l'**enveloppe** du back (`configurations[]` nommées, `active_id`, aucune active = IA par défaut) ; l'écran est une liste de radios-cartes dont cocher **bascule aussitôt** (`activate`), plus un éditeur (`editor`, création ou modification) ; le pied du chat offre la même bascule dans le menu de l'engrenage et un sélecteur de modèle (champ à autocomplétion sur `listModels` avec le `config_id` de l'active, `alignedReasoning` avant l'`update`). Formulaire : ordre des champs provider → clé API → base_url → modèle → **nom** — **aucun champ texte avant le password** (Firefox greffe son gestionnaire de mots de passe sur le champ texte qui précède un `<input type="password">`) ; jamais de `<datalist>` natif. Les préférences de raisonnement sont des `<select>` natifs après le modèle, aux options du catalogue back par couple (provider, modèle) — `reasoning_options` de la configuration, sonde `reasoningOptions` au changement de provider et au blur du modèle, `alignReasoningWithOptions` — ; les frozensets miroir (`PROVIDERS_WITH_REASONING_*` d'`ai-credentials.model.ts`) ne servent qu'au gating du payload (`null` hors capacités) ; le pied du chat les enregistre aussitôt sur la configuration **active** par le PUT reconstruit (`payloadFromConfiguration`, même ordre de clés que `payloadFromForm` : l'éditeur compare les snapshots JSON).
- SSR : `src/server.ts` lit `ALLOWED_HOSTS`/`TRUST_PROXY_HEADERS`/`PORT` ; sans `ALLOWED_HOSTS` correct, le serveur répond 400.

**Mesure d'audience et consentement**
- Opt-in strict : posthog-js n'est **téléchargé** (`await import('posthog-js')`, jamais d'import statique) qu'une fois la mesure autorisée par l'environnement **et** acceptée. `environment.analytics.enabled: false` ou clé vide ⇒ ni bannière, ni chargement, ni stockage.
- Le bandeau est derrière un `@defer` d'`app.html` (déclencheur `needsBanner() || preferencesOpen()`, les deux entrées) : hors du bundle initial, qui frôle son plafond. Une spec qui le traverse pose `deferBlockBehavior: DeferBlockBehavior.Playthrough`.
- **Tout ce qui sort passe par `scrubEvent`** (`core/analytics/scrub.ts`, posé en `before_send`) : le token de partage est un segment d'URL, PostHog ne doit voir que des motifs de route (`/fr/shared/:token/blocks/:id`). Query, fragment et titre du document sont retirés. Modifier une route qui porte un secret dans son chemin, c'est modifier `scrub.ts`.
- Règle d'or des propriétés d'événement : un **énuméré ou un compteur**. Jamais de titre, de markdown, de réponse d'élève, de requête de recherche, de nom, d'email, d'identifiant — et jamais un token. Un nouvel événement s'ajoute à `AnalyticsEvents` (`core/analytics/analytics.events.ts`), qui impose ses propriétés au `capture`.
- Mesure large sous consentement (autocapture, rage/dead clicks, heatmaps, performances, exceptions, `capture_pageview: 'history_change'` — pas de capture manuelle de vue de page) ; seuls les sondages sont coupés. Ne **jamais** poser `advanced_disable_flags: true` : replay, heatmaps et autocapture lisent leur configuration dans la réponse `/flags`, sans elle `startSessionRecording()` n'enregistre rien.
- Replay : `maskAllInputs` + `REPLAY_MASK_SELECTOR` (sorties du modèle, corrigés). Ce sélecteur vise des **classes de template** et échouerait en silence à un renommage — `analytics.masking.spec.ts` le garde, le mettre à jour avec les classes.
- `ConsentService` n'injecte que `PLATFORM_ID`, `AnalyticsService` que `ConsentService` : **ni `Router`, ni `AuthService`, ni `HttpClient`** — c'est ce qui rend l'instrumentation des services `core/` indolore pour leurs specs. Le câblage routeur/identité vit dans `app.config.ts`. Une spec existante qui casse en ajoutant un `capture` signale une dépendance de trop.
- Le consentement est lu **après hydratation** (`afterNextRender`) : la home et `/:lang/privacy` sont prerendues, la bannière ne doit apparaître qu'ensuite (sinon NG0500). Pas de session replay sur une page élève (elle filmerait des réponses de mineurs). Identité = `sub` OIDC seul ; `person_profiles: 'always'`, donc les visiteurs anonymes ont aussi un profil. Le seul cookie du projet est celui de PostHog (`localStorage+cookie`, hôte exact) et il n'existe qu'après acceptation — le stockage nécessaire au fonctionnement (`oc-*`) n'en pose aucun.

## Tests

Vitest via `@angular/build:unit-test`, specs colocalisées `src/**/*.spec.ts`. `src/test-setup.ts` stubbe `matchMedia` et les storages. Transloco → `provideTranslocoTesting()` ; services de données → mocks à signaux (`testing/service-mocks.ts`, `testing/assistant.fixture.ts`), jamais de HTTP ; services HTTP → `provideHttpClientTesting()` + `HttpTestingController` ; flux SSE → `sseResponse` (`testing/sse.fixture.ts`) sur un `fetch` stubbé ; `<dialog>` → `showModal`/`close` stubbés sur l'élément. jsdom expose `navigator.language = 'en-US'` (specs de `LanguageService`). Les directives de focus et de drag (`ocTablist`, `ocResizeHandle`) se valident en vrai navigateur.

## Décisions à ne pas « corriger »

Détails dans `../docs/decisions.md`.

- Monaco en AMD depuis les assets, jamais bundlé.
- Modules interactifs exécutés en iframe sandbox à origine opaque, `'unsafe-eval'` toléré, réseau bloqué par CSP.
- Panneau assistant hors du router-outlet ; `RouteReuseStrategy` dédiée aux éditeurs.
- Pages élèves en `RenderMode.Client` explicite, sans query param.
- Style de lecture = propriété du cours (JSONB), pas préférence du lecteur.
- Pas de reverse proxy dans ce repo ; le SSR écoute sur 4000.
- Mesure d'audience en opt-in strict, posthog-js en import dynamique, URLs nettoyées avant tout envoi.

## Approfondissements

`docs/architecture.md` — Routing et rendu · Couche données · Espace cours · Éditeurs · Assistant IA · Markdown de cours · Impression et export HTML · Pages élèves et tuteur · Recherche · Réglages IA · Mesure d'audience et consentement · Design system et styles.
