/**
 * Source d'un fence ```abc : une mélodie en notation ABC (en-têtes `X:`, `T:`,
 * `M:`, `L:`, `K:` puis les notes), gravée et jouée par abcjs.
 *
 * Seule la banque de sons du piano est hébergée (`public/abcjs-soundfont/`) :
 * les directives MIDI (`%%MIDI …`, `I:MIDI …`, `[I:MIDI …]` en ligne) sont
 * retirées avant rendu. `options.program` d'abcjs n'est qu'un repli que ces
 * directives écrasent — un autre instrument, la percussion (`%%MIDI channel
 * 10`, `drum`) produiraient des 404 et un silence. Elles n'ont aucun effet sur
 * la gravure de la partition.
 */

const MIDI_LINE = /^[ \t]*(?:%%MIDI\b|I:[ \t]*MIDI\b).*(?:\r?\n|$)/gim;
const MIDI_INLINE = /\[I:[ \t]*MIDI\b[^\]]*\]/gi;

/** Source sans directive MIDI. */
export function stripMidiDirectives(source: string): string {
  return source.replace(MIDI_LINE, '').replace(MIDI_INLINE, '');
}

/** Titre (`T:`) de la première mélodie, pour l'étiquette accessible. */
export function abcTitle(source: string): string | null {
  const match = /^[ \t]*T:[ \t]*(.+?)[ \t]*$/m.exec(source);
  return match === null ? null : match[1];
}
