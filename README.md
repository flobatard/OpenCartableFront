# OpenCartableFront

Front Angular d'**OpenCartable**, plateforme pédagogique libre et auto-hébergée : un enseignant compose ses cours par blocs et les partage à ses élèves par simple lien, sans compte ; un élève connecté dispose d'un tuteur IA. Voir [Descriptions.md](Descriptions.md) (cadrage) et [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (design system) ; l'architecture est décrite dans [docs/architecture.md](docs/architecture.md).

Stack : Angular 22 (zoneless, SSR + prerender), [Transloco](https://jsverse.gitbook.io/transloco) (fr/en), [angular-oauth2-oidc](https://github.com/manfredsteyer/angular-oauth2-oidc) (OIDC Code + PKCE vers Zitadel), [Monaco Editor](https://microsoft.github.io/monaco-editor/), [marked](https://marked.js.org/) + [KaTeX](https://katex.org/) + [Mermaid](https://mermaid.js.org/) + DOMPurify, polices auto-hébergées via @fontsource.

## Fonctionnalités

- **Mes cours** (`/<lang>/courses`) : liste, création (matières et niveaux du système scolaire du profil), page cours à onglets Blocs | Ressources | Modules | Aperçu | Partage — quatre types de blocs (texte, exercice, document, module), réordonnancement par glisser-déposer, bibliothèque de fichiers (upload direct vers S3), bibliothèque de modules interactifs (HTML/CSS/JS exécutés en iframe sandbox), aperçu « vue élève », régime d'accès et liens de partage, export/import d'un cours en `.zip`.
- **Éditeurs** : bloc texte et exercice (Monaco, markdown avec formules LaTeX, diagrammes Mermaid, figures GeoGebra/JSXGraph/TikZ, ressources et modules intégrés, autosave), bloc document, bloc module, éditeur de module (trois Monaco + aperçu live). Style de lecture paramétrable par cours.
- **Assistant IA** : panneau de chat par cours (lecture des blocs, ressources et modules) et chats d'édition qui proposent des modifications revues dans l'éditeur (diff, accepter/rejeter, Ctrl-Z) — provider et clé IA choisis par l'enseignant dans **Paramètres › IA**, ou IA par défaut de la plateforme sous quota.
- **Pages élèves** (`/<lang>/shared/:token`, `/<lang>/p/courses/:id`, `/<lang>/p/:teacherId`) : sommaire, blocs, ressources, modules, cours entier et export PDF, résolution des exercices (réponses conservées sur l'appareil) et, pour un élève connecté, correction par un tuteur IA question par question.
- **Recherche publique** (`/<lang>/search`) : cours publics et enseignants qui ont choisi d'être visibles, avec facettes matière et niveau.
- **Documentation** des langages du markdown de cours (`/<lang>/markdown-language/docs`), avec bacs à sable.
- Onboarding, profil (avatar, nom public), thème clair/sombre, interface fr/en.

## Développement

```bash
npm install        # postinstall : prépare le runtime TikZJax (.tikzjax/, gitignoré)
npm start          # http://localhost:4200
```

Les réglages de dev (URL de l'API, OIDC) vivent dans `src/environments/environment.development.ts` ; ceux de preprod et de production dans `environment.preprod.ts` / `environment.prod.ts` (figés au build, cf. `fileReplacements` d'angular.json). L'API doit émettre des JWT (Zitadel : access tokens au format JWT) et accepter l'audience du client OIDC configuré ici.

## Tests

```bash
npm test                                           # vitest (jsdom), specs colocalisées src/**/*.spec.ts
npm test -- --include src/app/app.routes.spec.ts   # un seul fichier
```

## Build & rendu

```bash
npm run build                          # build production, home prerendue (fr, en)
npm run serve:ssr:OpenCartableFront    # sert dist/ via le serveur SSR Express (port 4000)
```

Rendu par route (`src/app/app.routes.server.ts`) : home prerendue au build, pages élèves, recherche, documentation et espace enseignant rendus côté client, le reste en SSR.

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

L'image se construit pour la cible choisie par `ARG BUILD_CONFIGURATION` (`production` par défaut, `preprod` possible). Le reverse proxy nginx (TLS, routage `/api`) est fourni par l'infra, hors périmètre de ce repo.

## Licence

GNU AGPL v3 — voir [LICENSE](LICENSE).
