import { NgxMonacoEditorConfig } from 'ngx-monaco-editor-v2';
import { CourseMonacoApi, registerCourseMonacoLanguages } from './course-monaco-lang';

/**
 * Config ngx-monaco partagée par TOUS les hôtes monaco du projet
 * (`app-markdown-editor`, diff des propositions de l'assistant) : monaco est
 * servi en AMD depuis les assets copiés (angular.json) — jamais bundlé — et
 * `onMonacoLoad` tire UNE fois, après le chargement de monaco et AVANT le
 * premier `editor.create` : c'est le point d'ancrage pour enregistrer nos
 * langages (`oc-markdown`/`latex`/`mermaid`) et thèmes (`oc-vs`/`oc-vs-dark`)
 * une seule fois, globalement (idempotent : le loader AMD ne recharge pas).
 * Il ne reçoit aucun argument → on lit `window.monaco`. Le `baseUrl` est
 * ABSOLU (le défaut du wrapper est relatif à la page → cassé sur les routes
 * profondes).
 */
export const MONACO_CONFIG: NgxMonacoEditorConfig = {
  baseUrl: '/monaco/vs',
  onMonacoLoad: () => {
    const m = (globalThis as { monaco?: CourseMonacoApi }).monaco;
    if (m) {
      registerCourseMonacoLanguages(m);
    }
  },
};
