/**
 * Credential IA de l'utilisateur — miroir du contrat API
 * `/v1/users/me/ai-credentials` (snake_case conservé, convention du repo).
 *
 * La clé API n'est JAMAIS renvoyée par l'API : seul `api_key_definie`
 * indique qu'une clé est enregistrée (chiffrée côté serveur).
 */

/** Valeurs de l'enum `AIProvider` du back, dans l'ordre d'affichage. */
export const AI_PROVIDERS = [
  'anthropic',
  'openai',
  'google',
  'mistral',
  'ollama',
  'openai_compatible',
  'huggingface',
] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Providers pour lesquels le champ base_url est proposé (openai_compatible l'exige). */
export const PROVIDERS_WITH_BASE_URL: readonly AiProvider[] = ['ollama', 'openai_compatible'];

/** Providers dont la clé API est facultative (miroir du back). */
export const PROVIDERS_KEY_OPTIONAL: readonly AiProvider[] = ['ollama', 'openai_compatible'];

export interface AiCredentials {
  provider: AiProvider | null;
  model: string | null;
  base_url: string | null;
  api_key_definie: boolean;
}

/** État « rien de configuré », aussi posé après un DELETE réussi. */
export const EMPTY_AI_CREDENTIALS: AiCredentials = {
  provider: null,
  model: null,
  base_url: null,
  api_key_definie: false,
};

export interface AiCredentialsPayload {
  provider: AiProvider;
  model: string;
  /** OMIS (jamais `null` explicite) = conserver la clé déjà enregistrée. */
  api_key?: string;
  base_url: string | null;
}
