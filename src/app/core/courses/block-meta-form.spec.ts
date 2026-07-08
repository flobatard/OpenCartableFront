import {
  buildBlockMetaForm,
  patchBlockMetaForm,
  payloadFromBlockMetaForm,
} from './block-meta-form';
import { CourseBlock } from './course.model';

function block(over: Partial<CourseBlock> = {}): CourseBlock {
  return {
    id: 'block-1',
    position: 0,
    type: 'texte',
    titre: null,
    description: null,
    content: {},
    resource_id: null,
    ...over,
  };
}

describe('block-meta-form', () => {
  it('mappe le formulaire vers le méta en trimant titre et description', () => {
    const form = buildBlockMetaForm();
    form.setValue({ titre: '  Mon titre  ', description: '  Ma description.  ' });

    expect(payloadFromBlockMetaForm(form)).toEqual({
      titre: 'Mon titre',
      description: 'Ma description.',
    });
  });

  it('un titre ou une description vide/blanc devient null', () => {
    const form = buildBlockMetaForm();
    form.setValue({ titre: '   ', description: '' });

    expect(payloadFromBlockMetaForm(form)).toEqual({ titre: null, description: null });
  });

  it('patchBlockMetaForm pré-remplit depuis un bloc (null → chaîne vide)', () => {
    const form = buildBlockMetaForm();

    patchBlockMetaForm(form, block({ titre: 'Titre A', description: null }));
    expect(form.getRawValue()).toEqual({ titre: 'Titre A', description: '' });
    // Le méta reflète le bloc : description absente → null.
    expect(payloadFromBlockMetaForm(form)).toEqual({ titre: 'Titre A', description: null });
  });
});
