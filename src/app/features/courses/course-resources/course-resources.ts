import { Component, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { CourseResource } from '../../../core/resources/resource.model';
import { ResourceService } from '../../../core/resources/resource.service';
import { formatBytes } from '../../../core/resources/resource.utils';

/**
 * Onglet « Ressources » d'un cours : bibliothèque des fichiers S3 rattachés au
 * cours, indépendante des blocs. Upload en trois temps orchestré par
 * `ResourceService` (presign → PUT direct S3 → confirm, avec progression),
 * renommage inline (pas de modale — testable en jsdom), téléchargement par URL
 * présignée et suppression en deux temps désarmée au blur (motif des blocs).
 * Après une suppression, l'output `deleted` prévient la page : les blocs
 * `document` pointeurs ont été supprimés PAR LE SERVEUR (FK CASCADE), le
 * détail du cours doit être rechargé.
 */
@Component({
  selector: 'app-course-resources',
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './course-resources.html',
  styleUrl: './course-resources.scss',
})
export class CourseResources implements OnInit {
  readonly #resources = inject(ResourceService);
  protected readonly language = inject(LanguageService);

  readonly courseId = input.required<string>();

  /** Une ressource a été supprimée — la page resynchronise les blocs document. */
  readonly deleted = output<void>();

  protected readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly list = this.#resources.list;
  protected readonly loading = this.#resources.listLoading;
  protected readonly loadError = this.#resources.listError;
  protected readonly uploadState = this.#resources.uploadState;

  /** Une mutation en vol (renommage/suppression/téléchargement) fige les actions. */
  protected readonly mutating = signal(false);
  protected readonly mutationError = signal(false);
  /** Id de la ressource « armée » pour suppression (le 2e clic confirme). */
  protected readonly pendingDelete = signal<string | null>(null);
  /** Id de la ressource en cours de renommage inline (`null` = aucune). */
  protected readonly renamingId = signal<string | null>(null);

  /** Nom saisi pendant le renommage inline. Public : les specs le pilotent. */
  readonly renameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(255)],
  });

  ngOnInit(): void {
    this.reload();
  }

  protected reload(): void {
    this.#resources.loadList(this.courseId());
  }

  protected formatSize(taille: number): string {
    return formatBytes(taille);
  }

  /** Date d'ajout dans la locale de l'UI (pas de DatePipe : locale fr non enregistrée). */
  protected addedOn(iso: string): string {
    return new Date(iso).toLocaleDateString(this.language.lang());
  }

  protected openFilePicker(): void {
    this.fileInput()?.nativeElement.click();
  }

  /** Fichier choisi : upload complet, l'input est vidé pour permettre un retry. */
  protected async onFileSelected(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) {
      return;
    }
    try {
      await this.#resources.upload(this.courseId(), file);
    } catch {
      // L'état d'erreur est porté par uploadState (message + retry côté vue).
    }
  }

  protected startRename(resource: CourseResource): void {
    this.renamingId.set(resource.id);
    this.renameControl.setValue(resource.nom_original);
    this.mutationError.set(false);
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
  }

  protected async saveRename(resource: CourseResource): Promise<void> {
    const nom = this.renameControl.value.trim();
    if (!nom || this.mutating()) {
      return;
    }
    this.#startMutation();
    try {
      await this.#resources.rename(this.courseId(), resource.id, nom);
      this.renamingId.set(null);
    } catch {
      this.mutationError.set(true);
    } finally {
      this.mutating.set(false);
    }
  }

  /** Ouvre l'URL présignée dans un nouvel onglet (TTL court, jamais stockée). */
  protected async download(resource: CourseResource): Promise<void> {
    if (this.mutating()) {
      return;
    }
    this.#startMutation();
    try {
      const url = await this.#resources.getDownloadUrl(this.courseId(), resource.id);
      window.open(url, '_blank', 'noopener');
    } catch {
      this.mutationError.set(true);
    } finally {
      this.mutating.set(false);
    }
  }

  protected async remove(resource: CourseResource): Promise<void> {
    if (this.mutating()) {
      return;
    }
    if (this.pendingDelete() !== resource.id) {
      this.pendingDelete.set(resource.id);
      return;
    }
    this.#startMutation();
    try {
      await this.#resources.deleteResource(this.courseId(), resource.id);
      this.deleted.emit();
    } catch {
      this.mutationError.set(true);
    } finally {
      this.mutating.set(false);
    }
  }

  /** Quitter le bouton armé (focus ailleurs) annule la suppression. */
  protected disarmDelete(): void {
    this.pendingDelete.set(null);
  }

  #startMutation(): void {
    this.mutating.set(true);
    this.mutationError.set(false);
    this.pendingDelete.set(null);
  }
}
