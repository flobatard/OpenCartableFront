import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-footer',
  imports: [TranslocoPipe],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  /* Obligation AGPL « réseau » : le lien vers les sources reste visible sur chaque page. */
  protected readonly sourceUrl = 'https://github.com/flobatard/OpenCartableFront';
}
