import { BlockType, CourseVisibility } from '../courses/course.model';
import { PublicAccess } from '../public-courses/public-course.model';
import { AssistantContext } from '../course-assistant/assistant.model';
import { ProposalMode } from '../course-assistant/proposals';
import { SubmissionEffort, SubmissionKind, SubmissionVerdict } from '../student/exercise-correction';

/**
 * Carte typée des événements de mesure — source de vérité unique : `capture()`
 * n'accepte que ces noms, avec exactement ces propriétés.
 *
 * RÈGLE D'OR : une propriété est un ÉNUMÉRÉ ou un COMPTEUR. Jamais de titre de
 * cours, de markdown, de réponse d'élève, de requête de recherche, de nom,
 * d'email — et jamais un token de partage. Aucun identifiant non plus : les
 * entonnoirs par cours ne sont pas un besoin actuel, et chaque id envoyé est
 * une donnée de plus chez un tiers.
 */
export interface AnalyticsEvents {
  /** Profil complété pour la première fois : fin de l'entonnoir d'inscription. */
  signup_completed: Record<string, never>;

  /** Création d'un cours, quelle que soit la porte d'entrée. */
  course_created: { source: 'blank' | 'import' | 'starter' };
  course_block_added: { blockType: BlockType };
  /** Changement de visibilité — c'est l'acte de publication. */
  course_visibility_changed: { visibility: CourseVisibility };
  share_link_created: Record<string, never>;
  course_exported: Record<string, never>;
  resource_uploaded: { mimeGroup: MimeGroup };
  module_created: Record<string, never>;

  /** Consultation d'un cours par un élève — les deux régimes d'accès. */
  course_viewed: { access: PublicAccess['mode']; blocks: number };
  student_module_opened: Record<string, never>;
  student_resource_opened: Record<string, never>;
  course_pdf_exported: { role: 'teacher' | 'student' };

  exercise_answer_submitted: { kind: SubmissionKind };
  /** `effort` est `null` quand le tuteur ne l'a pas qualifié (miroir du SSE `done`). */
  exercise_graded: {
    verdict: SubmissionVerdict;
    effort: SubmissionEffort | null;
    revealed: boolean;
  };

  assistant_message_sent: { context: AssistantContext };
  /** `auto` : décision prise par le mode « édition auto », sans revue. */
  assistant_proposal_decided: { accepted: boolean; auto: boolean };
  assistant_proposal_mode_changed: { mode: ProposalMode };

  /** La requête elle-même n'est JAMAIS envoyée. */
  search_performed: { scope: 'courses' | 'teachers'; hasFilters: boolean };

  course_tab_viewed: { tab: 'blocks' | 'resources' | 'modules' | 'preview' | 'share' };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

/** Famille de média d'une ressource — jamais le mime exact, jamais le nom du fichier. */
export type MimeGroup = 'image' | 'pdf' | 'audio' | 'video' | 'other';

export function mimeGroup(mimeType: string): MimeGroup {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) {
    return 'image';
  }
  if (mime.startsWith('audio/')) {
    return 'audio';
  }
  if (mime.startsWith('video/')) {
    return 'video';
  }
  if (mime === 'application/pdf') {
    return 'pdf';
  }
  return 'other';
}
