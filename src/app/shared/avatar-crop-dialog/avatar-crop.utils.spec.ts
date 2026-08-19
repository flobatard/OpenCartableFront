import {
  centeredOffset,
  clampOffset,
  coverScale,
  sourceRect,
  zoomedOffset,
} from './avatar-crop.utils';

/* Cas de référence : cadre 320, image paysage 800×400.
   coverScale = 320/400 = 0.8 → affichée 640×320. */
const FRAME = 320;
const PAYSAGE = { width: 800, height: 400 };

describe('avatar-crop.utils', () => {
  describe('coverScale', () => {
    it('couvre le cadre par le petit côté (paysage)', () => {
      expect(coverScale(PAYSAGE, FRAME)).toBe(0.8);
    });

    it('couvre le cadre par le petit côté (portrait)', () => {
      expect(coverScale({ width: 400, height: 800 }, FRAME)).toBe(0.8);
    });

    it('agrandit une image plus petite que le cadre', () => {
      expect(coverScale({ width: 160, height: 320 }, FRAME)).toBe(2);
    });
  });

  describe('clampOffset', () => {
    const scale = 0.8; // affichée 640×320

    it('laisse passer un offset valide', () => {
      expect(clampOffset({ x: -100, y: 0 }, scale, PAYSAGE, FRAME)).toEqual({ x: -100, y: 0 });
    });

    it('bloque au bord gauche/haut (offset jamais positif)', () => {
      expect(clampOffset({ x: 5, y: 12 }, scale, PAYSAGE, FRAME)).toEqual({ x: 0, y: 0 });
    });

    it("bloque au bord droit/bas (l'image couvre toujours le cadre)", () => {
      // min x = 320 − 640 = −320 ; min y = 320 − 320 = 0.
      expect(clampOffset({ x: -900, y: -50 }, scale, PAYSAGE, FRAME)).toEqual({ x: -320, y: 0 });
    });
  });

  describe('centeredOffset', () => {
    it("centre l'excédent de l'axe long, cale l'axe ajusté", () => {
      expect(centeredOffset(0.8, PAYSAGE, FRAME)).toEqual({ x: -160, y: 0 });
    });
  });

  describe('zoomedOffset', () => {
    it('garde fixe le point au centre du cadre', () => {
      // Au centre du cadre (160,160) avec offset (−160,0) et échelle 0.8,
      // le point d'image est (400,200). À l'échelle 1.6 il doit y rester :
      // offset' = 160 − 400×1.6 = −480 (x), 160 − 200×1.6 = −160 (y).
      expect(zoomedOffset({ x: -160, y: 0 }, 0.8, 1.6, FRAME)).toEqual({ x: -480, y: -160 });
    });

    it('est neutre quand l’échelle ne change pas', () => {
      expect(zoomedOffset({ x: -42, y: -7 }, 0.8, 0.8, FRAME)).toEqual({ x: -42, y: -7 });
    });
  });

  describe('sourceRect', () => {
    it('convertit cadre → pixels naturels', () => {
      // offset (−160,0), échelle 0.8 : le cadre voit l'image depuis (200,0)
      // sur 400×400 px naturels.
      expect(sourceRect({ x: -160, y: 0 }, 0.8, FRAME)).toEqual({
        x: 200,
        y: 0,
        width: 400,
        height: 400,
      });
    });

    it('reste dans les bornes de l’image pour un offset clampé', () => {
      // Offset extrême clampé (−320, 0) : source (400,0)+400×400 — le bord
      // droit tombe exactement sur width=800.
      const rect = sourceRect({ x: -320, y: 0 }, 0.8, FRAME);
      expect(rect.x + rect.width).toBe(PAYSAGE.width);
      expect(rect.y + rect.height).toBe(PAYSAGE.height);
    });
  });
});
