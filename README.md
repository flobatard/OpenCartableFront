# OpenCartableFront

Front Angular d'**OpenCartable**, plateforme pédagogique libre et auto-hébergée : un enseignant compose ses cours et les partage à ses élèves par simple lien public. Voir [Descriptions.md](Descriptions.md) (cadrage) et [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (design system).

Stack : Angular 22 (zoneless, SSR + prerender), [Transloco](https://jsverse.gitbook.io/transloco) (fr/en), [angular-oauth2-oidc](https://github.com/manfredsteyer/angular-oauth2-oidc) (OIDC Code + PKCE vers Zitadel), polices auto-hébergées via @fontsource.

## Fonctionnalités

- **Matières** (`/<lang>/subjects`, réservé au prof authentifié) : navigation dans la taxonomie hiérarchique des disciplines en treeview (déplier/replier, recherche filtrante, compteur d'enfants et niveau). Alimentée par `SubjectService` (`src/app/core/subjects/`) — un fetch unique de `GET /api/v1/subjects/tree` mis en cache. Composant réutilisable `SubjectPicker` (`src/app/shared/subject-picker/`) pour sélectionner une matière dans un formulaire (`ControlValueAccessor`, accessible clavier + ARIA).
- **Mes cours** (`/<lang>/courses`) : liste des cours du prof (cartes avec badges matières/niveaux, compteur de blocs, dernière modification), création (`/courses/new` — titre, description, matières, niveaux filtrés par le système scolaire du profil) et **espace blocs** (`/courses/:id`) : ajout par type (texte, exercice, lien — `ressource` arrivera avec le stockage S3), réordonnancement par boutons, suppression avec confirmation en deux temps.
- **Éditeur de bloc texte** (`/courses/:id/blocks/:blockId`) : [Monaco Editor](https://microsoft.github.io/monaco-editor/) auto-hébergé (assets copiés au build sous `/monaco/vs`, thème clair/sombre suivi), onglets **Éditeur / Aperçu**, **enregistrement automatique** débouncé. Le markdown peut embarquer des **formules LaTeX** — `$…$` en ligne, `$$…$$` centrée — rendues par [KaTeX](https://katex.org/) dans l'aperçu (HTML sanitisé par DOMPurify via `renderCourseMarkdown`, `src/app/core/markdown/`).

## Développement

```bash
npm install
npm start          # http://localhost:4200
```

Les réglages de dev (URL de l'API, OIDC) vivent dans `src/environments/environment.development.ts` ; les valeurs de production dans `src/environments/environment.prod.ts` (figées au build, cf. `fileReplacements` d'angular.json).

## Tests

```bash
npm test           # vitest (jsdom), specs colocalisées src/**/*.spec.ts
```

## Build & rendu

```bash
npm run build                          # build production, home prerendered
npm run serve:ssr:OpenCartableFront    # sert dist/ via le serveur SSR Express (port 4000)
```

Rendu par route (`src/app/app.routes.server.ts`) : `/` prerendered au build, `/auth/callback` client uniquement, les routes protégées par authentification (ex. `/<lang>/subjects`) en rendu client, le reste en SSR.

## Docker

```bash
docker compose up --build              # http://localhost:4000
```

Variables d'environnement du conteneur :

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `4000` | Port d'écoute du serveur SSR |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Hôtes acceptés (protection SSRF d'Angular SSR) — en production, le domaine public |
| `TRUST_PROXY_HEADERS` | *(aucun)* | En-têtes `X-Forwarded-*` à accepter derrière le reverse proxy, ex. `x-forwarded-host,x-forwarded-proto` |

Le reverse proxy nginx (TLS, routage `/api`) est fourni par l'infra, hors périmètre de ce repo.

## Licence

GNU AGPL v3 — voir [LICENSE](LICENSE).
