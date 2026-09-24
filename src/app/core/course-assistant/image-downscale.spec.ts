import { downscaleImage } from './image-downscale';

/**
 * jsdom ne rend ni images ni canvas : `createImageBitmap` et `toBlob` sont
 * stubbés, comme le fait `avatar-crop-dialog.spec.ts`. Ce qui est testé ici
 * est la DÉCISION (réduire ou non, quelle qualité, quel repli), pas l'encodage.
 */
describe('downscaleImage', () => {
  const CAP = 3_500_000;

  function stubBitmap(width: number, height: number) {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width, height, close }),
    );
    return close;
  }

  /** `toBlob` rend un blob de la taille voulue, ou `null` (encodage refusé). */
  function stubCanvas(sizes: (number | null)[], type = 'image/webp') {
    const toBlob = vi.fn((callback: BlobCallback) => {
      const size = sizes.shift() ?? null;
      callback(size === null ? null : ({ size, type } as Blob));
    });
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob,
    } as unknown as HTMLCanvasElement);
    return toBlob;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a small image untouched: re-encoding would often make it heavier', async () => {
    const close = stubBitmap(800, 600);
    const file = new File(['x'], 'capture.png', { type: 'image/png' });

    await expect(downscaleImage(file, CAP)).resolves.toBe(file);
    expect(close).toHaveBeenCalled();
  });

  it('shrinks an oversized photo and keeps the produced mime', async () => {
    stubBitmap(4000, 3000);
    stubCanvas([1_000_000]);
    const file = bigFile('photo.jpg', 'image/jpeg');

    const result = await downscaleImage(file, CAP);
    expect(result).not.toBe(file);
    expect(result.type).toBe('image/webp');
    // L'extension suit le format réellement produit.
    expect(result.name).toBe('photo.webp');
  });

  it('lowers the quality until it fits, and stops at the first that does', async () => {
    stubBitmap(4000, 3000);
    const toBlob = stubCanvas([CAP + 1, CAP + 1, 900_000]);
    const file = bigFile('photo.jpg', 'image/jpeg');

    const result = await downscaleImage(file, CAP);
    expect(toBlob).toHaveBeenCalledTimes(3);
    expect(result).not.toBe(file);
  });

  it('trusts blob.type rather than assuming WebP: the browser may fall back to PNG', async () => {
    stubBitmap(4000, 3000);
    stubCanvas([1_000_000], 'image/png');
    const result = await downscaleImage(bigFile('photo.jpg', 'image/jpeg'), CAP);

    expect(result.type).toBe('image/png');
    expect(result.name).toBe('photo.png');
  });

  it('gives the original back when nothing fits, and lets the back decide', async () => {
    stubBitmap(4000, 3000);
    stubCanvas([CAP + 1, CAP + 1, CAP + 1]);
    const file = bigFile('photo.jpg', 'image/jpeg');

    await expect(downscaleImage(file, CAP)).resolves.toBe(file);
  });

  it('gives the original back when the file cannot be decoded', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('nope')));
    const file = new File(['x'], 'broken.png', { type: 'image/png' });

    await expect(downscaleImage(file, CAP)).resolves.toBe(file);
  });

  /** Un File dont `size` dépasse le plafond, sans allouer les octets. */
  function bigFile(name: string, type: string): File {
    const file = new File(['x'], name, { type });
    Object.defineProperty(file, 'size', { value: CAP + 1_000_000 });
    return file;
  }
});
