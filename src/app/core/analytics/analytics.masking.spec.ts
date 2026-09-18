import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPLAY_MASK_SELECTOR } from './analytics.service';

/**
 * `REPLAY_MASK_SELECTOR` masque les sorties du modèle et les corrigés dans les
 * enregistrements de session — par des classes de template. Ce couplage échoue
 * en SILENCE : renommer une classe ne casse rien à la compilation, et le
 * masquage disparaît sans que personne le voie. Ce test le rend bruyant.
 */
describe('REPLAY_MASK_SELECTOR', () => {
  const templates = {
    'features/course-assistant/course-chat/course-chat.html': [
      'course-chat__thread',
      'course-chat__thinking',
    ],
    'features/course-assistant/course-chat/course-chat-questions.html': ['chat-questions'],
    'features/course-assistant/global-proposal-review/global-proposal-review.html': [
      'global-proposal-review',
    ],
    'shared/course-blocks-view/exercise-view.html': [
      'exercise-view__thread',
      'exercise-view__revealed-answer',
    ],
    'features/admin/admin-jobs/admin-jobs.html': ['admin-jobs'],
  } as const;

  it('ne vise que des classes qui existent encore dans les templates', () => {
    for (const [template, classes] of Object.entries(templates)) {
      const html = readFileSync(join(process.cwd(), 'src/app', template), 'utf-8');
      for (const className of classes) {
        expect(html, `${className} a disparu de ${template}`).toContain(className);
      }
    }
  });

  it('couvre chaque classe attendue', () => {
    for (const classes of Object.values(templates)) {
      for (const className of classes) {
        expect(REPLAY_MASK_SELECTOR).toContain(`.${className}`);
      }
    }
  });
});
