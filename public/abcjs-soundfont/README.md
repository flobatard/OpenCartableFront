# Banque de sons de piano (partitions ABC)

Échantillons MP3 du piano acoustique (`acoustic_grand_piano`, programme General MIDI 0), une note par fichier, joués par la lecture audio des blocs ```` ```abc ```` (`shared/markdown-extensions/abc/`). Ils sont hébergés ici pour que la lecture ne fasse partir aucune requête hors origine : sans `soundFontUrl`, abcjs les chargerait depuis `paulrosen.github.io`.

- Source : [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts), branche `gh-pages`, commit `044fab8e1456bfafc5776e86dfd6bb8697149aef`, dossier `FluidR3_GM/acoustic_grand_piano-mp3/` (88 fichiers, copiés sans modification).
- Échantillons générés à partir de la banque **Fluid R3 GM** (Frank Wen), publiée sous licence [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/). Le dépôt source est sous licence MIT (© 2012 Benjamin Gleitzman).

Un seul instrument est hébergé : les directives `%%MIDI` et `I:MIDI` sont retirées de la source avant la lecture (piano forcé).
