import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../markdown-playground/markdown-playground';

/**
 * Page de documentation du langage ```passage — montée par DocsShell (slug
 * `passage`, cf. PASSAGE_EXTENSION.doc). Prose via i18n `docs.passage.*` ;
 * extraits d'œuvres du domaine public en constantes non traduites.
 */
@Component({
  selector: 'app-passage-doc',
  imports: [MarkdownPlayground, TranslocoPipe],
  templateUrl: './passage-doc.html',
})
export class PassageDoc {
  protected readonly firstExample =
    '```passage\n' +
    'Demain, dès l’aube, à l’heure où blanchit la campagne,\n' +
    'Je partirai. Vois-tu, je sais que tu m’attends.\n' +
    'J’irai par la forêt, j’irai par la montagne.\n' +
    'Je ne puis demeurer loin de toi plus longtemps.\n' +
    '\n' +
    'Je marcherai les yeux fixés sur mes pensées,\n' +
    'Sans rien voir au dehors, sans entendre aucun bruit,\n' +
    'Seul, inconnu, le dos courbé, les mains croisées,\n' +
    'Triste, et le jour pour moi sera comme la nuit.\n' +
    '\n' +
    'Je ne regarderai ni l’or du soir qui tombe,\n' +
    'Ni les voiles au loin descendant vers Harfleur,\n' +
    'Et quand j’arriverai, je mettrai sur ta tombe\n' +
    'Un bouquet de houx vert et de bruyère en fleur.\n' +
    '```\n' +
    '\n' +
    'Victor Hugo, *Les Contemplations*, 1856.';

  protected readonly proseExample =
    '```passage\n' +
    'Il y avait en Westphalie, dans le château de M. le baron de\n' +
    'Thunder-ten-tronckh, un jeune garçon à qui la nature avait donné\n' +
    'les mœurs les plus douces. Sa physionomie annonçait son âme. Il\n' +
    'avait le jugement assez droit, avec l’esprit le plus simple ; c’est,\n' +
    'je crois, pour cette raison qu’on le nommait Candide. Les anciens\n' +
    'domestiques de la maison soupçonnaient qu’il était fils de la sœur\n' +
    'de monsieur le baron et d’un bon et honnête gentilhomme du\n' +
    'voisinage, que cette demoiselle ne voulut jamais épouser parce\n' +
    'qu’il n’avait pu prouver que soixante et onze quartiers, et que le\n' +
    'reste de son arbre généalogique avait été perdu par l’injure du\n' +
    'temps.\n' +
    '```\n' +
    '\n' +
    'Voltaire, *Candide ou l’Optimisme*, chapitre premier, 1759.';

  protected readonly optionsExample =
    '```passage\n' +
    'start=10\n' +
    'À ces mots le Corbeau ne se sent pas de joie ;\n' +
    '    Et pour montrer sa belle voix,\n' +
    'Il ouvre un large bec, laisse tomber sa proie.\n' +
    'Le Renard s’en saisit, et dit : « Mon bon Monsieur,\n' +
    '    Apprenez que tout flatteur\n' +
    'Vit aux dépens de celui qui l’écoute :\n' +
    'Cette leçon vaut bien un fromage, sans doute. »\n' +
    '    Le Corbeau, honteux et confus,\n' +
    'Jura, mais un peu tard, qu’on ne l’y prendrait plus.\n' +
    '```\n' +
    '\n' +
    'Jean de La Fontaine, « Le Corbeau et le Renard », *Fables*, I, 2, 1668.';
}
