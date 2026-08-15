import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../markdown-playground/markdown-playground';

@Component({
  selector: 'app-tikz-doc',
  imports: [MarkdownPlayground, TranslocoPipe],
  templateUrl: './tikz-doc.html',
})
export class TikzDoc {
  protected readonly firstExample = `\`\`\`tikz
    \\coordinate (B) at (0,0);
    \\coordinate (C) at (8,0);
    \\coordinate (A) at (0,6);

    % Tracé du triangle avec un léger fond coloré
    \\draw[thick, fill=blue!5] (A) -- (B) -- (C) -- cycle;

    % Marque de l'angle droit en B
    \\draw[thick] (0,0.5) -- (0.5,0.5) -- (0.5,0);

    % Noms des sommets
    \\node[above left] at (A) {$A$};
    \\node[below left] at (B) {$B$};
    \\node[below right] at (C) {$C$};

    % Affichage des longueurs
    \\node[left] at (0,3) {6 cm};
    \\node[below] at (4,0) {8 cm};
  
    % Point d'interrogation sur l'hypoténuse
    \\node[above right, text=red] at (4,3) {$?$}; 
    \`\`\`
    
    `;

  protected readonly configExample = 
    `\`\`\`tikz
      \\begin{tikzpicture}[
        scale=0.7,                                         % Échelle globale de la figure
        line join=round,                                   % Arrondit les angles des lignes brisées (ex: sommets du triangle)
        triangle style/.style={fill=yellow!15, draw=orange, very thick}, % Création d'un style pour le triangle
        point mark/.style={circle, fill=blue!80!black, inner sep=1.5pt}, % Style pour marquer les points géométriques
        label text/.style={text=blue!70!black, font=\\small}              % Style global pour le texte des étiquettes
      ]

        % Définition du centre et du rayon
        \\coordinate (O) at (0,0);
        \\def\\R{5}

        % Définition des points A, B (diamètre) et C
        \\coordinate (A) at (-\\R,0);
        \\coordinate (B) at (\\R,0);
        \\coordinate (C) at (-1.4, 4.8);

        % Tracé du cercle (avec une couleur de trait spécifique)
        \\draw[thick, draw=gray!80] (O) circle (\\R);

        % Tracé du triangle en utilisant le style personnalisé défini dans les options de l'environnement
        \\draw[triangle style] (A) -- (B) -- (C) -- cycle;

        % Marquage des points en utilisant le style "point mark"
        \\node[point mark, label={[label text]left:$A$}] at (A) {};
        \\node[point mark, label={[label text]right:$B$}] at (B) {};
        \\node[point mark, label={[label text]above:$C$}] at (C) {};
        \\node[point mark, label={[label text]below:$O$}] at (O) {};

        % Tracé du rayon OC avec des pointillés
        \\draw[dashed, draw=gray!60] (O) -- (C);

        % Affichage des longueurs connues
        \\node[below, font=\\bfseries] at (0,-0.2) {10 cm};
        \\node[above left, font=\\bfseries] at (-3.2, 2.4) {6 cm};

        % Point d'interrogation mis en valeur
        \\node[above right, text=red, font=\\Large\\bfseries] at (1.8, 2.4) {$?$};

      \\end{tikzpicture}
    \`\`\``;
}