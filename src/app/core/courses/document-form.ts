import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DocumentContentPayload } from './course.model';

/**
 * Formulaire du contenu d'un bloc document : helpers purs sur le modèle de
 * `block-meta-form.ts`, consommés par l'éditeur de document. Le formulaire ne
 * porte que l'éditorial d'affichage (légende + mode) — la ressource pointée
 * est une colonne du bloc, éditée à part (`updateBlockResource`).
 */

/** Longueur miroir du back (`DocumentContent.caption`). */
const CAPTION_MAX = 500;

export type DocumentForm = FormGroup<{
  caption: FormControl<string>;
  display: FormControl<'inline' | 'download'>;
}>;

export function buildDocumentForm(): DocumentForm {
  return new FormGroup({
    caption: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(CAPTION_MAX)],
    }),
    display: new FormControl<'inline' | 'download'>('inline', { nonNullable: true }),
  });
}

/**
 * Normalise le `content` JSONB d'un bloc document en payload sûr : `caption`
 * chaîne non vide ou `null`, `display` replié sur `'inline'` si absent ou
 * inconnu (contenu par défaut du back, ou donnée d'une version antérieure).
 */
export function payloadFromDocumentContent(
  content: Record<string, unknown>,
): DocumentContentPayload {
  const caption = typeof content['caption'] === 'string' ? content['caption'] : null;
  return {
    caption: caption !== null && caption !== '' ? caption : null,
    display: content['display'] === 'download' ? 'download' : 'inline',
  };
}

/** Payload du PATCH depuis l'état courant du formulaire (légende vide → `null`). */
export function payloadFromDocumentForm(form: DocumentForm): DocumentContentPayload {
  const { caption, display } = form.getRawValue();
  const trimmed = caption.trim();
  return { caption: trimmed === '' ? null : trimmed, display };
}

/** Pré-remplit le formulaire depuis le `content` d'un bloc (sans émettre). */
export function patchDocumentFormFromContent(
  form: DocumentForm,
  content: Record<string, unknown>,
): void {
  const payload = payloadFromDocumentContent(content);
  form.patchValue(
    { caption: payload.caption ?? '', display: payload.display },
    { emitEvent: false },
  );
}
