import { CourseBlock } from '../../../core/courses/course.model';
import { blockExcerpt, moveId } from './course-blocks.utils';

function block(type: CourseBlock['type'], content: Record<string, unknown>): CourseBlock {
  return {
    id: 'b1',
    position: 0,
    type,
    titre: null,
    description: null,
    content,
    resource_id: null,
  };
}

describe('blockExcerpt', () => {
  it('extrait le contenu selon le type de bloc', () => {
    expect(blockExcerpt(block('texte', { markdown: 'Un cours magistral' }))).toBe(
      'Un cours magistral',
    );
    expect(blockExcerpt(block('exercice', { enonce: 'Résoudre x²=4', questions: [] }))).toBe(
      'Résoudre x²=4',
    );
    expect(
      blockExcerpt(block('lien', { url: 'https://ex.org', titre: 'Une vidéo', fournisseur: null })),
    ).toBe('Une vidéo');
  });

  it('replie un lien sans titre sur son URL', () => {
    expect(blockExcerpt(block('lien', { url: 'https://ex.org', titre: '' }))).toBe(
      'https://ex.org',
    );
  });

  it('renvoie une chaîne vide pour un bloc sans contenu ou de type inconnu du helper', () => {
    expect(blockExcerpt(block('texte', {}))).toBe('');
    expect(blockExcerpt(block('texte', { markdown: '   ' }))).toBe('');
    expect(blockExcerpt(block('ressource', { legende: 'Une image' }))).toBe('');
  });

  it('aplatit les blancs et tronque à 80 caractères avec une ellipse', () => {
    expect(blockExcerpt(block('texte', { markdown: 'Un\ntitre\n\navec  retours' }))).toBe(
      'Un titre avec retours',
    );
    const long = blockExcerpt(block('texte', { markdown: 'x'.repeat(120) }));
    expect(long).toHaveLength(80);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('moveId', () => {
  const ids = ['a', 'b', 'c'];

  it('déplace un id vers le haut ou le bas', () => {
    expect(moveId(ids, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(ids, 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('reste sans effet hors bornes ou sur un id inconnu (copie inchangée)', () => {
    expect(moveId(ids, 'a', -1)).toEqual(ids);
    expect(moveId(ids, 'c', 1)).toEqual(ids);
    expect(moveId(ids, 'z', 1)).toEqual(ids);
  });

  it('retourne toujours un nouveau tableau', () => {
    expect(moveId(ids, 'b', -1)).not.toBe(ids);
    expect(moveId(ids, 'a', -1)).not.toBe(ids);
  });
});
