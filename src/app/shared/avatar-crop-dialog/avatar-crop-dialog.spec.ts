import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { AvatarCropDialog } from './avatar-crop-dialog';

/* jsdom : ni layout, ni décodage d'image, ni canvas — les specs pilotent les
   handlers publics/protégés et stubbent createObjectURL (précédent
   `downloadBlob`) et l'API canvas ; la géométrie est couverte par
   avatar-crop.utils.spec.ts. */

function fakeFile(): File {
  return new File(['x'], 'photo.png', { type: 'image/png' });
}

describe('AvatarCropDialog', () => {
  let fixture: ComponentFixture<AvatarCropDialog>;
  let component: AvatarCropDialog;
  let host: HTMLElement;
  let dialogEl: HTMLDialogElement;

  beforeEach(() => {
    URL.createObjectURL ??= () => '';
    URL.revokeObjectURL ??= () => {};
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:avatar');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    TestBed.configureTestingModule({
      imports: [AvatarCropDialog, provideTranslocoTesting()],
    });
    fixture = TestBed.createComponent(AvatarCropDialog);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    dialogEl = host.querySelector('dialog')!;
  });

  afterEach(() => vi.restoreAllMocks());

  it("open() montre la modale sur l'object URL du fichier", () => {
    const showModal = (dialogEl.showModal = vi.fn());
    component.open(fakeFile());
    fixture.detectChanges();

    expect(showModal).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:avatar');
  });

  it('le bouton Valider reste désactivé tant que l’image n’est pas chargée', () => {
    component.open(fakeFile());
    fixture.detectChanges();

    const confirm = host.querySelector<HTMLButtonElement>('.btn--primary');
    expect(confirm?.disabled).toBe(true);
  });

  it('affiche l’erreur badImage quand le décodage échoue', () => {
    component.open(fakeFile());
    fixture.detectChanges();

    host.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(host.querySelector('.avatar-crop__error')).not.toBeNull();
    expect(host.querySelector('.avatar-crop__frame')).toBeNull();
  });

  it('la fermeture native révoque l’object URL et purge l’état', () => {
    component.open(fakeFile());
    fixture.detectChanges();

    dialogEl.dispatchEvent(new Event('close'));
    fixture.detectChanges();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar');
    expect(host.querySelector('img')).toBeNull();
  });

  it('confirm exporte un carré 512 JPEG, ferme PUIS émet (cropped)', async () => {
    const emitted: Blob[] = [];
    component.cropped.subscribe((blob) => emitted.push(blob));
    component.open(fakeFile());
    fixture.detectChanges();

    // Simule le chargement de l'image (jsdom ne décode pas) : dimensions
    // naturelles posées à la main puis handler de load.
    const img = host.querySelector<HTMLImageElement>('img')!;
    Object.defineProperty(img, 'naturalWidth', { value: 800 });
    Object.defineProperty(img, 'naturalHeight', { value: 400 });
    img.dispatchEvent(new Event('load'));
    fixture.detectChanges();

    const jpeg = new Blob(['jpg'], { type: 'image/jpeg' });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      function (this: HTMLCanvasElement, callback, type, quality) {
        expect(this.width).toBe(512);
        expect(this.height).toBe(512);
        expect(type).toBe('image/jpeg');
        expect(quality).toBe(0.85);
        callback(jpeg);
      },
    );
    const close = vi.spyOn(dialogEl, 'close');

    host.querySelector<HTMLButtonElement>('.btn--primary')!.click();

    expect(drawImage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalled();
    expect(emitted).toEqual([jpeg]);
  });

  it('Annuler ferme sans émettre', () => {
    const emitted: Blob[] = [];
    component.cropped.subscribe((blob) => emitted.push(blob));
    component.open(fakeFile());
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('.btn--secondary')!.click();
    fixture.detectChanges();

    expect(emitted).toEqual([]);
  });
});
