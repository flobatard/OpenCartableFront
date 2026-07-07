# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Front Angular 22 d'**OpenCartable**, plateforme pédagogique auto-hébergée (AGPLv3) : un prof authentifié (OIDC/Zitadel) compose des cours, les élèves les consultent via liens publics sans compte. Cadrage produit : `Descriptions.md`. Design system (source de vérité UI) : `DESIGN_SYSTEM.md`.

## Commandes

Node est géré par nvm ; dans un shell non-interactif, npm n'est pas sur le PATH :

```bash
export PATH="$HOME/.nvm/versions/node/v26.3.0/bin:$PATH"
```

```bash
npm start                              # dev server (4200)
npm run build                          # build prod + prerender de la home
npm test                               # vitest (jsdom)
npm test -- --include src/app/core/theme/theme.service.spec.ts   # un seul fichier
npm test -- --filter "ThemeService"    # par nom de suite/test
npm run serve:ssr:OpenCartableFront    # sert dist/ via Express (4000)
docker compose up --build              # conteneur SSR (4000)
```

Après tout changement touchant SSR/i18n/prerender, vérifier que `dist/OpenCartableFront/browser/index.html` contient bien le texte français rendu (pas de chaînes vides) : c'est le symptôme d'une régression du préchargement Transloco.

## Architecture et invariants

**Zoneless** (pas de zone.js — défaut Angular v22) : tout état partagé est exposé en **signaux** ; les souscriptions rxjs écrivent dans des signaux. Ne jamais ajouter `provideZoneChangeDetection`.

**Trois modes de rendu** (`src/app/app.routes.server.ts`) : `/` prerendered au build, `/auth/callback` client-only (il manipule URL et storage), `**` SSR. Toute nouvelle route doit choisir son mode ; une route qui touche `window`/`localStorage` sans garde ne peut pas être SSR/prerender. Une route protégée par `authGuard` doit être en `RenderMode.Client` (le guard renvoie `false` au serveur — jamais authentifiée au SSR, donc jamais prerendable) : cf. `:lang/subjects`.

**Couche données HTTP** : `SubjectService` (`src/app/core/subjects/`) est le patron des accès API. Un seul `HttpClient.get` par ressource, mis en cache via `shareReplay({ bufferSize: 1, refCount: false })`, état exposé en signaux (`tree`/`loading`/`error`) alimentés par la souscription rxjs. Le Bearer Zitadel est attaché **automatiquement** par l'intercepteur d'`angular-oauth2-oidc` à toute requête sous `environment.apiUrl` (`resourceServer.allowedUrls` dans `app.config.ts`) — ne pas ajouter de header manuel ; `apiUrl` inclut déjà `/api`. Fetch déclenché côté navigateur uniquement (guard `isPlatformBrowser`). Les helpers purs de l'arbre (recherche, chemin d'ancêtres, aplatissement, lignes de treeview) vivent dans `subject.utils.ts`, testés isolément. `EducationLevelService` (`src/app/core/education-levels/`) est le second exemplaire du patron (mêmes signaux + cache) ; ses helpers minimaux vivent dans `education-level.utils.ts` — on ne généralise **pas** `subject.utils.ts` pour ne pas coupler les deux pickers. Les libellés métier (`nom` des matières et des niveaux d'étude) viennent de l'API et **ne passent pas** par l'i18n.

`UserProfileService` (`src/app/core/users/`) est la variante **mutable** du patron : pas de `shareReplay` figé mais un signal `profile` source de vérité, une **promesse en vol partagée** (`ensureLoaded()` — callback et guard n'émettent qu'un GET, invalidée sur erreur pour permettre le retry), les mutations remplacent le signal (le `PUT /users/me/onboarding` renvoie le profil à jour, pas de refetch) et un `effect` purge le profil quand `AuthService.isAuthenticated()` retombe.

**Composants partagés** (`src/app/shared/`) : composants réutilisables transverses. `SubjectPicker` y est le premier `ControlValueAccessor` (valeur = `id` du nœud, utilisable en Reactive Forms) ; tout nouveau form control suit ce modèle (provider `NG_VALUE_ACCESSOR` + `forwardRef`, `writeValue`/`registerOnChange`/`setDisabledState`, navigation clavier + ARIA treeview). `EducationLevelPicker` est le premier CVA **multi**-sélection : valeur = `string[]` d'ids toujours émise en ordre d'arbre (jamais `null`, ids inconnus préservés) ; pattern volontairement plus simple — disclosure + cases à cocher natives (pas de treeview ARIA ni de recherche, arbre ~22 nœuds toujours déplié), chips « badge niveau » (slate) sous le champ. `EducationLevelPicker` accepte un input `systeme` (filtre les **racines** de l'arbre au système scolaire donné ; `null` = tous) — le contrat « ids inconnus préservés » demeure : c'est au parent de vider la valeur quand le système change. `SubjectMultiPicker` (`shared/subject-multi-picker/`) est le CVA multi-matières **par composition** : il embarque le `SubjectPicker` mono (non modifié) comme champ d'ajout via un `FormControl` interne réinitialisé à chaque sélection, valeur = `string[]` en ordre d'ajout dédoublonné, chips « badge matière » (indigo). **Piège de nommage** : `SubjectLevel` et les clés `subjects.level.*` désignent la *profondeur* de l'arbre des matières ; tout ce qui touche aux niveaux d'étude vit sous `EducationLevel*` / `educationLevels.*`. Pièges : un `viewChild()` ne peut pas être posé sur un champ privé ES (`#`) — le marquer `protected` ; et ne pas nommer une variable de template (`#foo`) comme un signal du composant (le template résout la ref avant le signal).

**Chaîne i18n (fragile, ne pas "simplifier")** — Transloco fr/en :
- Le loader (`src/app/core/i18n/transloco-loader.ts`) passe par des `import()` dynamiques de JSON, **pas** par HTTP : au prerender il n'y a aucun serveur pour répondre à une URL relative.
- Un `provideAppInitializer` dans `app.config.ts` précharge la langue active avant le premier rendu — sans lui, le HTML prerendered sort avec des chaînes vides.
- La langue persistée de l'utilisateur est restaurée **après** l'hydratation (`afterNextRender` dans `App`) : la restaurer plus tôt fait diverger le premier rendu client du DOM serveur (erreur NG0500).
- Traductions dans `src/app/i18n/{fr,en}.json` — garder les deux fichiers symétriques.

**Thème clair/sombre** : attribut `data-theme="dark"` sur `<html>`, posé avant le premier paint par le script inline d'`index.html` (anti-FOUC). `ThemeService` **lit** cet attribut au bootstrap au lieu de recalculer — préserver ce contrat. Les swaps visuels dépendant du thème (ex. logo) se font en CSS sur `[data-theme]`, jamais par binding (mismatch d'hydratation).

**OIDC** : `AuthService` (`src/app/core/auth/`) est la **seule** couche autorisée à importer `angular-oauth2-oidc` (exigence de remplaçabilité de l'IdP, Descriptions.md §8). Code flow + PKCE, client public. Init browser-only et sans appel réseau au démarrage : les pages publiques élèves ne doivent jamais dépendre de la disponibilité de Zitadel. Le `state` restauré au callback est validé (chemins internes uniquement).

**Onboarding bloquant** (`features/onboarding/`, route `:lang/onboarding`, RenderMode.Client) : au retour du callback (`AuthCallback`), le profil est chargé (`ensureLoaded()`) et un profil incomplet est redirigé vers `/:lang/onboarding?next=<cible>`. Les routes protégées portent `canActivate: [authGuard, onboardingGuard]` — **dans cet ordre** (le guard onboarding laisse passer les non-authentifiés), et `onboardingGuard` ne doit **jamais** être posé sur la route onboarding elle-même (boucle) : c'est le composant qui renvoie un profil déjà complet vers `next`. Guard et callback sont **fail-open** si l'API profil est injoignable (ne jamais enfermer l'utilisateur hors de l'app). La page est le premier usage des **Reactive Forms typés** du projet : en zoneless, la réactivité du template passe par `toSignal(form.valueChanges)` ; le stepper est **dynamique** (liste d'étapes `computed` dérivée des rôles cochés — prof, élève ou les deux ; décocher un rôle vide son bloc, changer de système vide les niveaux choisis).

**Environnements** : `environment.ts` (défaut dev) remplacé par fileReplacements (`.development.ts` / `.prod.ts`). Le type commun vit dans `environment.model.ts`, qui n'est **jamais** remplacé — ne pas importer de types depuis `./environment` dans les fichiers remplacés (import circulaire au build). Config figée au build (pas d'injection runtime), sauf `ALLOWED_HOSTS` / `TRUST_PROXY_HEADERS` / `PORT`, lues par `src/server.ts` (protection SSRF d'Angular SSR : sans `ALLOWED_HOSTS` correct, le serveur répond 400).

**Design system** : les tokens CSS de `src/styles/_tokens.scss` recopient le §10 de `DESIGN_SYSTEM.md` — toute couleur/typo passe par `var(--…)`, jamais de hex en dur dans les composants. Cibles de contraste : AA partout, AAA dans `.course-content`. Pièges connus : `slate-400` interdit pour du texte (réservé désactivé/décoratif), l'ambre n'est jamais une couleur de texte, texte blanc sur indigo uniquement sur indigo-600/700. Polices auto-hébergées (@fontsource, déclarées dans `angular.json > styles` — pas d'`@import` Google Fonts). Libellés en sentence case (§9).

**Sass** : `styles.scss` n'utilise que `@use` (jamais `@import` scss, déprécié — et `@use` doit précéder toute autre règle).

## Tests

Vitest via le builder `@angular/build:unit-test`, specs colocalisées `src/**/*.spec.ts`. `src/test-setup.ts` stubbe `matchMedia` et les storages (absents de l'environnement jsdom du builder). Pour les composants utilisant Transloco, passer par `provideTranslocoTesting()` (`src/app/testing/transloco-testing.ts`) ; mocker `AuthService` avec des signaux, `OAuthService` avec des `vi.fn()`. Attention : jsdom expose `navigator.language = 'en-US'`, ce qui influence les tests de `LanguageService`.

Services HTTP : `provideHttpClient()` + `provideHttpClientTesting()`, assertions via `HttpTestingController` (sans réseau réel). Les composants consommant un service de données le mockent avec des signaux (`tree`/`loading`/`error`) et des `vi.fn()` — pas de HTTP. Fixture d'arbre partagée : `src/app/testing/subjects.fixture.ts` (profondeur mixte, pour les helpers et le rendu). `--include` attend des chemins de specs (`*.spec.ts`) — un glob `dossier/**` embarque aussi `.html`/`.scss` et casse le build de test.
