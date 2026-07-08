# OpenCartable — Design System

> Système de design d'**OpenCartable**, plateforme pédagogique auto-hébergée et open source (AGPLv3).
> Version 1.2 — cible d'accessibilité **hybride** : **AA sur toute l'interface, AAA sur le contenu de cours**.

---

## 1. Identité en bref

OpenCartable est un hub de diffusion de contenu pédagogique : un enseignant compose ses cours et les partage par lien public. Identité **claire, organisée et chaleureuse**, jamais enfantine.

- **Sérieux mais accessible** : indigo pour le savoir et la confiance, ambre pour la chaleur.
- **Ouvert et assumé** : le préfixe « Open » revendique le côté auto-hébergé, libre et sans compte imposé — l'identité doit respirer la transparence, pas le produit fermé.
- **Le contenu est roi** : l'interface s'efface, la zone de lecture est optimisée pour un confort maximal (AAA).
- **Sentence case partout**, verbes d'action, zéro jargon côté élève.

---

## 2. Stratégie d'accessibilité (hybride)

| Zone | Cible | Texte courant | Grand texte | Non-texte |
|---|---|---|---|---|
| Interface (chrome, boutons, badges, navigation, cartes) | **AA** | 4.5:1 | 3:1 | 3:1 |
| **Contenu de cours** (paragraphes, titres, encadrés, légendes lus par l'élève) | **AAA** | **7:1** | **4.5:1** | 3:1 |

Concrètement, la zone de lecture applique la classe `.course-content`, qui **surcharge** quelques tokens (texte secondaire, liens, sémantiques-texte) vers des valeurs 7:1 et active les règles de présentation visuelle (1.4.8). Le reste de l'app hérite des tokens AA.

Le corps de texte principal est déjà `slate-900` (17.85:1) — donc AAA « gratuitement ». Ce qui bascule dans le contenu, ce sont les **éléments secondaires** : texte gris, liens, et couleurs sémantiques employées comme texte.

---

## 3. Logo

### Fichiers

| Fichier | Usage |
|---|---|
| `opencartable-logo-horizontal.svg` | Lockup principal (symbole + mot vectorisé) |
| `opencartable-symbol.svg` | Symbole seul couleur |
| `opencartable-logo-horizontal-mono.svg` | Lockup une couleur (`currentColor`) — fonds sombres, impression |
| `opencartable-symbol-mono.svg` | Symbole une couleur (`currentColor`) — favicon, app icon |

Le mot-symbole est vectorisé en courbes (Outfit SemiBold) : aucune dépendance à une police installée. Le **wordmark** se lit en deux temps : **« Open » en indigo** (`#4F46E5`, il enchaîne visuellement avec le symbole) puis **« Cartable » en slate 900** (`#0F172A`). En version monochrome, les deux parts passent en `currentColor` et c'est le camelCase (le C majuscule) qui marque la césure. Le symbole cartable — inchangé — évoque le rangement et le partage du cours ; il tient seul comme icône. Le symbole indigo sur blanc est à 6.29:1, largement au-dessus du seuil non-texte (3:1) ; les logos sont de toute façon exemptés du contraste.

### Règles

- **Zone de protection** ≥ hauteur de la poignée (~25 % de la hauteur du symbole) ; **taille min** 16 px (symbole) / 96 px (lockup).
- Version couleur sur fond clair uniquement ; sur fond sombre ou chargé, utiliser la version mono en `color:#fff`.
- Ne pas recolorer, étirer, incliner, ombrer, ni recomposer le lockup à la main.

---

## 4. Couleurs

### Échelles de base

```
Indigo   900 #312E81 · 800 #3730A3 · 700 #4338CA · 600 #4F46E5 · 500 #6366F1 · 400 #818CF8 · 300 #A5B4FC · 100 #E0E7FF · 50 #EEF2FF
Ambre    800 #92400E · 700 #B45309 · 500 #F59E0B · 400 #FBBF24 · 100 #FEF3C7
Slate    900 #0F172A · 800 #1E293B · 700 #334155 · 600 #475569 · 500 #64748B · 400 #94A3B8 · 300 #CBD5E1 · 200 #E2E8F0 · 100 #F1F5F9 · 50 #F8FAFC
Succès   800 #065F46 · 700 #047857 · 500 #10B981 · 300 #6EE7B7
Info     800 #075985 · 700 #0369A1 · 500 #0EA5E9 · 300 #7DD3FC
Erreur   800 #991B1B · 700 #B91C1C · 500 #EF4444 · 300 #FCA5A5
```

### Rôles — Interface (AA)

| Rôle | Valeur (clair) | Ratio | Valeur (sombre) | Ratio |
|---|---|---|---|---|
| Texte principal | `slate-900` | 17.85 | `slate-50` | 13.98 |
| Texte secondaire | `slate-500` | 4.76 | `slate-300` | 9.85 |
| Texte discret (désactivé/décoratif **seulement**) | `slate-400` | — | `slate-500` | — |
| Lien / primaire | `indigo-600` | 6.29 | `indigo-400` | 4.90 |
| Bordure séparatrice (décorative) | `slate-200` | — | `slate-700` | — |
| Bordure de contrôle (porteuse, 3:1) | `slate-500` | 4.76 | `slate-500` | 3.07 |

> `slate-400` ne passe pas le texte AA (2.56) : il est réservé aux états **désactivés** (exemptés) et au décor. Un **placeholder** est du texte → minimum `slate-500`.

### Rôles — Contenu de cours (AAA, surcharge dans `.course-content`)

| Rôle | Valeur (clair) | Ratio | Valeur (sombre) | Ratio |
|---|---|---|---|---|
| Texte principal | `slate-900` | 17.85 | `slate-50` | 13.98 |
| Texte secondaire / légende | `slate-600` | 7.58 | `slate-300` | 9.85 |
| Lien dans le texte | `indigo-700` | 7.90 | `indigo-300` | 7.34 |

### Couleurs sémantiques

La teinte **500** vive ne sert que d'**aplat, de liseré ou d'icône** (non-texte, 3:1). Le **mot** à côté prend une version foncée :

| Sens | Texte en interface (AA) | Texte en contenu (AAA) | Sombre (contenu) |
|---|---|---|---|
| Succès | `emerald-700` (5.48) | `emerald-800` | `emerald-300` |
| Info | `sky-700` (5.93) | `sky-800` | `sky-300` |
| Attention | `amber-800` (7.09) | `amber-800` | `amber-400` |
| Erreur | `red-700` (6.47) | `red-800` | `red-300` |

### Texte sur fond coloré

Toujours le ton le plus foncé de la même famille, jamais du noir pur : `indigo-50/100` → `indigo-700` · `amber-100` → `#92400E` · `slate-100` → `slate-700` · succès clair `#D1FAE5` → `#047857`.

### L'ambre : une limite assumée

L'ambre est **impossible à 7:1 sur blanc** sans virer au brun. Il reste donc un **accent d'aplat/liseré**, jamais un mot coloré — ni en interface, ni dans le contenu. La chaleur passe par les surfaces, pas par le texte.

---

## 5. Typographie

| Rôle | Police | Poids | Où |
|---|---|---|---|
| Display / titres / logo | **Outfit** | 600 · 500 | Titres, en-têtes, wordmark |
| Interface & corps | **Inter** | 400 · 500 | Corps, UI, boutons, labels |
| Code & données | **JetBrains Mono** | 400 · 500 | Code, clés S3, valeurs techniques |

### Échelle

| Niveau | Taille | Interlignage | Police / poids |
|---|---|---|---|
| Display | 32 px | 1.15 | Outfit 600 |
| H1 | 28 px | 1.2 | Outfit 600 |
| H2 | 24 px | 1.25 | Outfit 600 |
| H3 | 20 px | 1.3 | Outfit 600 |
| H4 | 18 px | 1.35 | Outfit 500 |
| Corps | 16 px | **1.7** | Inter 400 |
| Small | 14 px | **1.5** | Inter 400/500 |
| Caption | 13 px | **1.5** | Inter 400 |
| Micro / label | 12 px | 1.4 | Inter 500 |

Interlignage relevé à ≥ 1.5 sur tous les blocs de texte (exigence 1.4.8, appliquée au contenu et adoptée partout par cohérence). Titres en Outfit avec `letter-spacing: -0.02em` ; corps en Inter sans tracking.

---

## 6. Iconographie

Jeu linéaire, trait ~1.75 px, coins arrondis (Lucide ou Tabler outline). 16–20 px en ligne, 24 px décoratif. Une icône **porteuse de sens** (statut, action) doit atteindre 3:1 (1.4.11) → au moins `slate-500` / `indigo-600`. Sentence case pour tout libellé.

---

## 7. Tokens de forme

| Rayon | Valeur | | Élévation | Valeur |
|---|---|---|---|---|
| `radius-sm` | 6 px | | `shadow-sm` | `0 1px 2px rgba(15,23,42,.06)` |
| `radius` | 8 px | | `shadow-md` | `0 4px 12px rgba(15,23,42,.08)` |
| `radius-lg` | 12 px | | | |
| `radius-full` | 999 px | | | |

Espacement base 4 (`4·8·12·16·24·32·48`). Style plat : pas de dégradé, glow ni ombre décorative. Jamais de coin arrondi sur une bordure d'un seul côté (`border-radius: 0` sur les accents `border-left`).

---

## 8. Composants

### Boutons

| Variante | Fond | Texte | Bordure |
|---|---|---|---|
| Primaire | `indigo-600` → hover `indigo-700` | blanc | — |
| Secondaire | transparent → hover `slate-100` | `slate-700` | `1px slate-500` |
| Accent | `amber-500` | `slate-900` | — |
| Fantôme | transparent → hover `slate-100` | `slate-600` | — |

Commun : `radius 8px`, `padding 9px 18px`, Inter 500 / 14 px. **Focus** : `outline 2px indigo-600, offset 2px` (≥ 2 px et ≥ 3:1, conforme 2.4.7 et 2.4.13).

### Badges

Fond tinté + texte foncé de la même famille, `radius 6px`, Inter 500 / 12 px : matière `indigo-50`/`indigo-700` · niveau `slate-100`/`slate-700` · partagé `#D1FAE5`/`#047857` · brouillon `amber-100`/`#92400E`.

### Champs

Hauteur 40 px, `radius 8px`, **bordure `1px slate-500`** (porteuse, 3:1), fond `#fff` distinct du fond de page. Placeholder **`slate-500`** (jamais `slate-400`). Focus : outline 2 px `indigo-600` + offset.

### Cartes

Fond `surface`, bordure `1px slate-200`, `radius 12px`, padding 16–20 px, `shadow-sm` si flottante. Titre Outfit 600 / 18 px, méta Inter 13 px `slate-500`.

### Blocs de contenu (dans `.course-content`, AAA)

Toute la zone d'édition/lecture d'un cours vit sous `.course-content` : largeur max **68ch**, interlignage **1.7**, texte aligné à gauche, espacement inter-paragraphe **1.5em**.

- **Titre** Outfit 600, 24/20 px. **Paragraphe** Inter 400, 16 px.
- **Encadré** : fond `indigo-50`, liseré gauche `3px indigo-600` (`radius 0`), texte `indigo-700` (7.07).
- **Fichier / image** : carte icône + nom + taille, téléchargement en bouton fantôme, **légende `slate-600`**.
- **Module interactif** : cadre `1px slate-500 dashed`, badge « interactif », iframe sandbox.

### Spinner / loader

Indicateur d'attente pour un chargement local (ex. l'éditeur Monaco qui s'initialise). Anneau rotatif : trace `1px border` (`slate-200`/dark `slate-700`), arc actif `color-primary`. Trois tailles — **sm 18 px**, **md 28 px** (défaut), **lg 44 px**, épaisseur 2–4 px. `role="status"` + libellé masqué (`.sr-only`, « Chargement… » par défaut) pour l'annonce lecteur d'écran. **Mouvement réduit** (`prefers-reduced-motion`) : la rotation se fige, l'anneau reste lisible en repli statique. Couleur exclusivement par token, jamais de hex en dur. Composant : `shared/spinner/`.

### Snackbar / toasts

Notifications globales transverses (erreur de connexion, échec d'auth…), empilées en **bas-gauche** (`fixed`, 16 px de marge), la plus récente près du coin, largeur max ~380 px. Chaque toast : fond `surface`, bordure `1px` + **liseré gauche 4 px** de la teinte **500** sémantique (erreur `red-500` · attention `amber-500` · info `sky-500` · succès `emerald-500`) — la couleur n'est **jamais** portée par le texte, doublée d'un glyphe (`!`, `i`, `✓`) pour ne pas encoder l'information par la seule couleur. Bouton de fermeture (`slate` secondaire). ARIA : `role="alert"` pour une erreur (annonce immédiate), `role="status"` sinon. Auto-fermeture temporisée (erreurs plus longtemps), fermeture manuelle possible, dédoublonnage des messages identiques. Animation d'entrée neutralisée par `prefers-reduced-motion`. Composant : `shared/snackbar/` alimenté par `NotificationService` (`core/notifications/`).

---

## 9. Ton & voix

- **Sentence case** partout ; Title Case réservé aux noms propres.
- **Verbe d'action d'abord** ; un libellé garde le même nom du bouton à la confirmation.
- Côté élève : zéro jargon (« Ouvrir le cours », « Télécharger le PDF »).
- **Erreurs** : dire ce qui s'est passé puis quoi faire, sans « Erreur : », sans excuse.
- **États vides** = invitation (« Compose ton premier cours »).
- Pas de « cliquez ici » : le lien décrit sa destination (2.4.9).

---

## 10. Tokens CSS (prêts à câbler)

```css
:root {
  /* Palette de base */
  --indigo-900:#312E81; --indigo-800:#3730A3; --indigo-700:#4338CA; --indigo-600:#4F46E5;
  --indigo-500:#6366F1; --indigo-400:#818CF8; --indigo-300:#A5B4FC; --indigo-100:#E0E7FF; --indigo-50:#EEF2FF;
  --amber-800:#92400E; --amber-700:#B45309; --amber-500:#F59E0B; --amber-400:#FBBF24; --amber-100:#FEF3C7;
  --emerald-800:#065F46; --emerald-700:#047857; --emerald-500:#10B981; --emerald-300:#6EE7B7;
  --sky-800:#075985; --sky-700:#0369A1; --sky-500:#0EA5E9; --sky-300:#7DD3FC;
  --red-800:#991B1B; --red-700:#B91C1C; --red-500:#EF4444; --red-300:#FCA5A5;
  --slate-900:#0F172A; --slate-800:#1E293B; --slate-700:#334155; --slate-600:#475569;
  --slate-500:#64748B; --slate-400:#94A3B8; --slate-300:#CBD5E1; --slate-200:#E2E8F0; --slate-100:#F1F5F9; --slate-50:#F8FAFC;

  /* Interface — cible AA (clair) */
  --color-primary:var(--indigo-600); --color-primary-hover:var(--indigo-700);
  --color-accent:var(--amber-500);            /* aplat / liseré uniquement */
  --bg-page:var(--slate-50); --bg-surface:#FFFFFF; --bg-subtle:var(--slate-100);
  --text-primary:var(--slate-900);
  --text-secondary:var(--slate-500);          /* 4.76 AA */
  --text-muted:var(--slate-400);              /* désactivé / décoratif */
  --link:var(--indigo-600);                   /* 6.29 AA */
  --border:var(--slate-200);                  /* séparateur décoratif */
  --border-control:var(--slate-500);          /* contour porteur, 3:1 */
  --focus-ring:var(--indigo-600);
  --text-success:var(--emerald-700); --text-info:var(--sky-700);
  --text-warning:var(--amber-800);  --text-danger:var(--red-700);

  /* Forme & typo */
  --font-display:'Outfit',system-ui,sans-serif;
  --font-sans:'Inter',system-ui,sans-serif;
  --font-mono:'JetBrains Mono',ui-monospace,monospace;
  --radius-sm:6px; --radius:8px; --radius-lg:12px; --radius-full:999px;
  --shadow-sm:0 1px 2px rgba(15,23,42,.06); --shadow-md:0 4px 12px rgba(15,23,42,.08);
}

/* Contenu de cours — cible AAA (7:1) + présentation visuelle 1.4.8 */
.course-content {
  --text-secondary:var(--slate-600);          /* 7.58 */
  --link:var(--indigo-700);                   /* 7.90 */
  --text-success:var(--emerald-800); --text-info:var(--sky-800);
  --text-warning:var(--amber-800);  --text-danger:var(--red-800);
  max-width:68ch; line-height:1.7; text-align:left;
}
.course-content p { margin-block:0 1.5em; }

/* Thème sombre */
[data-theme="dark"] {
  --color-primary:var(--indigo-500); --color-primary-hover:var(--indigo-400);
  --color-accent:var(--amber-400);
  --bg-page:var(--slate-900); --bg-surface:var(--slate-800); --bg-subtle:var(--slate-700);
  --text-primary:var(--slate-50);
  --text-secondary:var(--slate-300);          /* 9.85 */
  --text-muted:var(--slate-500);
  --link:var(--indigo-400);                   /* 4.90 AA */
  --border:var(--slate-700); --border-control:var(--slate-500);
  --focus-ring:var(--indigo-400);
  --text-success:var(--emerald-300); --text-info:var(--sky-300);
  --text-warning:var(--amber-400);  --text-danger:var(--red-300);
}
[data-theme="dark"] .course-content {
  --text-secondary:var(--slate-300);
  --link:var(--indigo-300);                   /* 7.34 */
  --text-success:var(--emerald-300); --text-info:var(--sky-300); --text-danger:var(--red-300);
}

/* Focus visible — >=2px, >=3:1, partout (2.4.7 / 2.4.13) */
:focus-visible { outline:2px solid var(--focus-ring); outline-offset:2px; }

/* Mouvement réduit (2.3.3) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration:.001ms !important; transition-duration:.001ms !important; }
}
```

Import des polices :

```css
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap');
```

---

## 11. Checklist de conformité

**Interface (AA)** — texte ≥ 4.5:1 (grand ≥ 3:1) · bordures de contrôle et icônes porteuses ≥ 3:1 · focus visible ≥ 2 px · placeholder ≥ `slate-500` · `slate-400` limité au désactivé.

**Contenu de cours (AAA)** — appliquer `.course-content` : texte ≥ 7:1 (grand ≥ 4.5:1) · largeur ≤ 80ch · interlignage ≥ 1.5 · pas de justification · espacement paragraphe ≥ 1.5× · liens explicites · texte en image évité (hors logo).

**Transverse** — `prefers-reduced-motion` respecté · thèmes clair/sombre (piste : ajouter un mode contraste élevé) · liens de partage expirés : message clair + régénération.

---

*OpenCartable Design System v1.2 — hybride AA / AAA. Palette Indigo / Ambre / Slate, Outfit + Inter + JetBrains Mono.*