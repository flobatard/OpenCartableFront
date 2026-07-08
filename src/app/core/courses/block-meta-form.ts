import { FormControl, FormGroup, Validators } from '@angular/forms';
import { BlockMetaPayload, CourseBlock } from './course.model';

/**
 * Formulaire des champs communs d'un bloc (titre/description) : helpers purs
 * sur le modèle de `course-form.ts`. Partagé par la modale de création et
 * l'éditeur de bloc. Les deux champs sont facultatifs (chaîne vide → `null`).
 */

/** Longueurs miroir du back (`titre` ≤ 300, `description` ≤ 500). */
const TITRE_MAX = 300;
const DESCRIPTION_MAX = 500;

export function buildBlockMetaForm() {
  return new FormGroup({
    titre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(TITRE_MAX)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(DESCRIPTION_MAX)],
    }),
  });
}

export type BlockMetaForm = ReturnType<typeof buildBlockMetaForm>;

/** Corps du méta : champs trimés, vide → `null` (idiome de `course-form.ts`). */
export function payloadFromBlockMetaForm(form: BlockMetaForm): BlockMetaPayload {
  const v = form.getRawValue();
  return {
    titre: v.titre.trim() || null,
    description: v.description.trim() || null,
  };
}

/** Pré-remplit le formulaire depuis un bloc (`null` → chaîne vide), sans émettre. */
export function patchBlockMetaForm(form: BlockMetaForm, block: CourseBlock): void {
  form.setValue(
    { titre: block.titre ?? '', description: block.description ?? '' },
    { emitEvent: false },
  );
}
