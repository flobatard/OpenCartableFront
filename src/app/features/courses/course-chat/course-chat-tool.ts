import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Longueur de l'extrait de résultat affiché — même valeur que
 * `TOOL_RESULT_EXCERPT_CHARS` côté back (`app/course_assistant/service.py`) :
 * un tour `tool` rechargé (contenu complet) et un tour replié depuis le flux
 * (extrait streamé) se présentent à l'identique.
 */
export const TOOL_RESULT_EXCERPT_CHARS = 400;

/** Outils du back (`app/course_assistant/tools.py` + tools de proposition de
    `app/course_assistant/editing/`) : libellé i18n dédié, repli générique
    sinon. Les tools de proposition n'apparaissent ici qu'en repli (appel
    échoué ou args malformés) — le cas nominal est rendu en carte de
    proposition (`app-course-chat-proposal`), jamais en ligne d'outil. */
const KNOWN_TOOLS = new Set([
  'read_block',
  'read_resource_pdf',
  'read_resource_image',
  'read_module',
  'propose_block_edit',
  'propose_statement_edit',
  'propose_question_edit',
  'propose_question_add',
  'propose_question_delete',
  'propose_html_edit',
  'propose_css_edit',
  'propose_js_edit',
]);

/** Un appel d'outil tel que rendu par le fil : persisté ou en cours. */
export interface ChatToolView {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'running' | 'done' | 'error';
  /** Extrait du résultat (message d'échec complet en erreur) ; `null` si inconnu ou en cours. */
  result: string | null;
}

/** Extrait affichable du contenu d'un tour `tool` persisté (servi complet par l'API). */
export function toolResultExcerpt(content: string): string {
  return content.length > TOOL_RESULT_EXCERPT_CHARS
    ? content.slice(0, TOOL_RESULT_EXCERPT_CHARS) + '…'
    : content;
}

/**
 * Ligne d'appel d'outil dépliable (`<details>` natif) : repliée, glyphe +
 * libellé + état (en cours / échec) ; dépliée, les paramètres de l'appel en
 * clé/valeur et le résultat — le message d'erreur complet en cas d'échec, un
 * extrait sinon (le contenu intégral reste côté serveur, cf. contrat SSE).
 */
@Component({
  selector: 'app-course-chat-tool',
  imports: [TranslocoPipe],
  templateUrl: './course-chat-tool.html',
  styleUrl: './course-chat-tool.scss',
})
export class CourseChatTool {
  readonly tool = input.required<ChatToolView>();

  protected readonly labelKey = computed(() => {
    const name = this.tool().name;
    return KNOWN_TOOLS.has(name) ? `courseChat.tools.${name}` : 'courseChat.tools.unknown';
  });

  /** Paramètres en lignes clé/valeur (valeurs non textuelles sérialisées en JSON). */
  protected readonly argEntries = computed(() =>
    Object.entries(this.tool().args ?? {}).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    })),
  );
}
