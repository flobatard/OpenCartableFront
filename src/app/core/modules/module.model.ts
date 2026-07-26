/**
 * Bibliothèque de modules interactifs HTML/CSS/JS d'un cours, servie par le
 * back (`/api/v1/courses/{id}/modules`). Les champs reprennent le contrat de
 * l'API tel quel (snake_case, français métier). Le code vit en base (pas de
 * S3) et est exécuté côté front dans une iframe sandbox à origine opaque
 * (`shared/module-runner/`). Les modules sont indépendants des blocs : un
 * bloc `module` peut en pointer un (`CourseBlock.module_id`), jamais
 * l'inverse.
 */

/** Miroir du `ModuleSummary` du back : la liste ne porte jamais le code. */
export interface ModuleSummary {
  id: string;
  titre: string;
  created_at: string;
  updated_at: string;
}

/** Miroir du `ModuleRead` du back : détail complet, code inclus. */
export interface ModuleDetail extends ModuleSummary {
  html: string;
  css: string;
  js: string;
}

/** Corps du `POST /courses/{id}/modules` (le code peut naître vide). */
export interface ModuleCreatePayload {
  titre: string;
  html?: string;
  css?: string;
  js?: string;
}

/** Corps du `PATCH /courses/{id}/modules/{mid}` — édition partielle. */
export interface ModuleUpdatePayload {
  titre?: string;
  html?: string;
  css?: string;
  js?: string;
}
