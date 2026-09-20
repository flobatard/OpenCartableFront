/**
 * Ordres de blocs des propositions structurelles de l'assistant global
 * (édition globale : ajout, réordonnancement) — helpers PURS, miroirs du
 * contrat de `PUT /courses/{id}/blocks/order` (exactement les blocs du cours,
 * sans doublon). `null` = rien d'applicable : l'hôte le rend comme une cible
 * introuvable (le cours a changé depuis la proposition).
 */

/**
 * Ordre après l'insertion de `newId` (bloc tout juste créé, donc en fin de
 * cours) derrière `afterId`. `null` si `afterId` n'est plus un bloc du cours —
 * l'appelant laisse alors le bloc en fin.
 */
export function orderWithInsert(
  currentIds: readonly string[],
  newId: string,
  afterId: string,
): string[] | null {
  const others = currentIds.filter((id) => id !== newId);
  const index = others.indexOf(afterId);
  if (index < 0) {
    return null;
  }
  return [...others.slice(0, index + 1), newId, ...others.slice(index + 1)];
}

/**
 * L'ordre proposé s'il porte exactement les blocs courants, chacun une fois ;
 * `null` sinon (bloc ajouté ou supprimé depuis la proposition, doublon).
 */
export function reorderTarget(
  currentIds: readonly string[],
  proposed: readonly string[],
): string[] | null {
  const wanted = new Set(proposed);
  if (wanted.size !== proposed.length || wanted.size !== currentIds.length) {
    return null;
  }
  return currentIds.every((id) => wanted.has(id)) ? [...proposed] : null;
}
