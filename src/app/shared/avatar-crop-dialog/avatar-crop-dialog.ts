import { Component, computed, ElementRef, output, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AVATAR_MIME, AVATAR_SIZE } from '../../core/users/user-profile.model';
import { NativeDialog } from '../dialog/native-dialog.directive';
import {
  centeredOffset,
  clampOffset,
  coverScale,
  Point,
  Size,
  sourceRect,
  zoomedOffset,
} from './avatar-crop.utils';

/** Côté du cadre de recadrage (px CSS) ; re-mesuré au chargement de l'image. */
const FRAME_FALLBACK = 320;
/** Bornes du zoom relatif (1 = l'image couvre tout juste le cadre). */
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
/** Qualité de l'export canvas (WebP lossy — la couche alpha survit). */
const EXPORT_QUALITY = 0.85;

/**
 * Modale de recadrage de la photo de profil — `<dialog>` natif (patron
 * `MarkdownHelpDialog` : `open()`/`close()` publics, directive `ocDialog`).
 * L'utilisateur déplace l'image (pointer drag avec `setPointerCapture`,
 * précédent : poignée du block-editor) et zoome au slider (précédent :
 * `course-style-dialog`) dans un cadre carré ; « Valider » exporte un carré
 * `AVATAR_SIZE` en WebP via canvas et émet `(cropped)` — la modale ferme
 * D'ABORD puis émet (comme resource-picker). Le fichier original n'est
 * jamais uploadé : seul le blob exporté part vers S3.
 *
 * Le canvas est transparent par défaut et le WebP porte une couche alpha :
 * un PNG à fond transparent le reste jusqu'à S3 (le JPEG le repeignait en
 * noir). Le mime de sortie n'est pas garanti pour autant — `toBlob` retombe
 * sur PNG si le navigateur n'encode pas le WebP —, d'où `avatarMimeOf` côté
 * upload : c'est `blob.type` qui fait foi, jamais `AVATAR_MIME`.
 *
 * Toute la géométrie vit dans `avatar-crop.utils.ts` (fonctions pures,
 * testées sans canvas — jsdom ne rend ni layout ni images). Client-only
 * (`URL.createObjectURL`, canvas) : monté par la page profil,
 * `RenderMode.Client`.
 */
@Component({
  selector: 'app-avatar-crop-dialog',
  imports: [NativeDialog, TranslocoPipe],
  templateUrl: './avatar-crop-dialog.html',
  styleUrl: './avatar-crop-dialog.scss',
})
export class AvatarCropDialog {
  /** Blob carré exporté après validation (WebP, PNG en repli navigateur). */
  readonly cropped = output<Blob>();

  protected readonly dialog = viewChild(NativeDialog);
  protected readonly frameEl = viewChild<ElementRef<HTMLElement>>('frameEl');
  protected readonly imageEl = viewChild<ElementRef<HTMLImageElement>>('imageEl');

  /** Object URL du fichier choisi (révoquée à la fermeture). */
  protected readonly src = signal<string | null>(null);
  /** L'image n'a pas pu être décodée (fichier non-image ou corrompu). */
  protected readonly badImage = signal(false);
  /** Dimensions naturelles de l'image, connues au `(load)`. */
  protected readonly natural = signal<Size | null>(null);
  /** Zoom relatif (1 = couverture minimale du cadre). */
  protected readonly zoom = signal(ZOOM_MIN);
  /** Translation du coin haut-gauche de l'image dans le cadre (px CSS). */
  protected readonly offset = signal<Point>({ x: 0, y: 0 });
  /** Côté réel du cadre, mesuré au chargement (repli hors layout : 320). */
  protected readonly frame = signal(FRAME_FALLBACK);

  /** Échelle affichée (px CSS / px naturels) — 0 tant que rien n'est chargé. */
  protected readonly scale = computed(() => {
    const natural = this.natural();
    return natural ? coverScale(natural, this.frame()) * this.zoom() : 0;
  });
  protected readonly ready = computed(() => this.natural() !== null && !this.badImage());

  protected readonly zoomMin = ZOOM_MIN;
  protected readonly zoomMax = ZOOM_MAX;

  #objectUrl: string | null = null;
  #dragStart: { pointer: Point; offset: Point } | null = null;

  /** Ouvre la modale sur le fichier choisi (l'état précédent est purgé). */
  open(file: File): void {
    this.#revokeUrl();
    this.badImage.set(false);
    this.natural.set(null);
    this.zoom.set(ZOOM_MIN);
    this.offset.set({ x: 0, y: 0 });
    this.#objectUrl = URL.createObjectURL(file);
    this.src.set(this.#objectUrl);
    this.dialog()?.open();
  }

  close(): void {
    this.dialog()?.close();
  }

  /** `(close)` natif du dialog : Échap/backdrop/boutons — purge l'état. */
  protected onClosed(): void {
    this.#revokeUrl();
    this.src.set(null);
    this.natural.set(null);
    this.badImage.set(false);
    this.#dragStart = null;
  }

  /** `(load)` de l'image : mesure le cadre, centre l'image au zoom minimal. */
  protected onImageLoad(): void {
    const img = this.imageEl()?.nativeElement;
    if (!img) {
      return;
    }
    const measured = this.frameEl()?.nativeElement.clientWidth;
    const frame = measured || FRAME_FALLBACK;
    const natural: Size = { width: img.naturalWidth, height: img.naturalHeight };
    if (!natural.width || !natural.height) {
      this.badImage.set(true);
      return;
    }
    this.frame.set(frame);
    this.natural.set(natural);
    this.zoom.set(ZOOM_MIN);
    this.offset.set(centeredOffset(coverScale(natural, frame), natural, frame));
  }

  protected onImageError(): void {
    this.badImage.set(true);
  }

  /** Slider de zoom : le point d'image au centre du cadre reste fixe. */
  protected onZoomInput(event: Event): void {
    const natural = this.natural();
    if (!natural) {
      return;
    }
    const value = Number((event.target as HTMLInputElement).value);
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
    const frame = this.frame();
    const base = coverScale(natural, frame);
    const next = zoomedOffset(this.offset(), base * this.zoom(), base * zoom, frame);
    this.zoom.set(zoom);
    this.offset.set(clampOffset(next, base * zoom, natural, frame));
  }

  /** Début de glissé : capture du pointeur (le drag survit à la sortie du cadre). */
  protected onPointerDown(event: PointerEvent): void {
    if (!this.ready()) {
      return;
    }
    event.preventDefault();
    this.frameEl()?.nativeElement.setPointerCapture(event.pointerId);
    this.#dragStart = {
      pointer: { x: event.clientX, y: event.clientY },
      offset: this.offset(),
    };
  }

  protected onPointerMove(event: PointerEvent): void {
    const start = this.#dragStart;
    const natural = this.natural();
    if (!start || !natural) {
      return;
    }
    const next = {
      x: start.offset.x + (event.clientX - start.pointer.x),
      y: start.offset.y + (event.clientY - start.pointer.y),
    };
    this.offset.set(clampOffset(next, this.scale(), natural, this.frame()));
  }

  protected onPointerUp(event: PointerEvent): void {
    this.#dragStart = null;
    this.frameEl()?.nativeElement.releasePointerCapture?.(event.pointerId);
  }

  /**
   * Export : dessine le rectangle source visible dans un canvas carré
   * `AVATAR_SIZE`, encode en WebP (alpha conservé), ferme puis émet le blob.
   */
  protected confirm(): void {
    const img = this.imageEl()?.nativeElement;
    const natural = this.natural();
    if (!img || !natural) {
      return;
    }
    const rect = sourceRect(this.offset(), this.scale(), this.frame());
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext('2d');
    if (!context) {
      this.badImage.set(true);
      return;
    }
    context.drawImage(
      img,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          this.badImage.set(true);
          return;
        }
        this.close();
        this.cropped.emit(blob);
      },
      AVATAR_MIME,
      EXPORT_QUALITY,
    );
  }

  #revokeUrl(): void {
    if (this.#objectUrl) {
      URL.revokeObjectURL(this.#objectUrl);
      this.#objectUrl = null;
    }
  }
}
