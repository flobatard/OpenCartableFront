import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DocumentContentPayload } from './course.model';

/**
 * Formulaire du contenu d'un bloc document : helpers purs sur le modèle de
 * `block-meta-form.ts`, consommés par l'éditeur de document. Le formulaire ne
 * porte que l'éditorial d'affichage (légende + mode) — la ressource pointée
 * est une colonne du bloc, éditée à part (`updateBlockResource`).
 */

/** Longueur miroir du back (`DocumentContent.legende`). */
const LEGENDE_MAX = 500;

export type DocumentForm = FormGroup<{
  legende: FormControl<string>;
  affichage: FormControl<'inline' | 'telechargement'>;
}>;

export function buildDocumentForm(): DocumentForm {
  return new FormGroup({
    legende: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(LEGENDE_MAX)],
    }),
    affichage: new FormControl<'inline' | 'telechargement'>('inline', { nonNullable: true }),
  });
}

/**
 * Normalise le `content` JSONB d'un bloc document en payload sûr : `legende`
 * chaîne non vide ou `null`, `affichage` replié sur `'inline'` si absent ou
 * inconnu (contenu par défaut du back, ou donnée d'une version antérieure).
 */
export function payloadFromDocumentContent(
  content: Record<string, unknown>,
): DocumentContentPayload {
  const legende = typeof content['legende'] === 'string' ? content['legende'] : null;
  return {
    legende: legende !== null && legende !== '' ? legende : null,
    affichage: content['affichage'] === 'telechargement' ? 'telechargement' : 'inline',
  };
}

/** Payload du PATCH depuis l'état courant du formulaire (légende vide → `null`). */
export function payloadFromDocumentForm(form: DocumentForm): DocumentContentPayload {
  const { legende, affichage } = form.getRawValue();
  const trimmed = legende.trim();
  return { legende: trimmed === '' ? null : trimmed, affichage };
}

/** Pré-remplit le formulaire depuis le `content` d'un bloc (sans émettre). */
export function patchDocumentFormFromContent(
  form: DocumentForm,
  content: Record<string, unknown>,
): void {
  const payload = payloadFromDocumentContent(content);
  form.patchValue(
    { legende: payload.legende ?? '', affichage: payload.affichage },
    { emitEvent: false },
  );
}
