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
    it('covers the frame by the short side (landscape)', () => {
      expect(coverScale(PAYSAGE, FRAME)).toBe(0.8);
    });

    it('covers the frame by the short side (portrait)', () => {
      expect(coverScale({ width: 400, height: 800 }, FRAME)).toBe(0.8);
    });

    it('scales up an image smaller than the frame', () => {
      expect(coverScale({ width: 160, height: 320 }, FRAME)).toBe(2);
    });
  });

  describe('clampOffset', () => {
    const scale = 0.8; // affichée 640×320

    it('lets a valid offset through', () => {
      expect(clampOffset({ x: -100, y: 0 }, scale, PAYSAGE, FRAME)).toEqual({ x: -100, y: 0 });
    });

    it('clamps at the left/top edge (offset never positive)', () => {
      expect(clampOffset({ x: 5, y: 12 }, scale, PAYSAGE, FRAME)).toEqual({ x: 0, y: 0 });
    });

    it("clamps at the right/bottom edge (the image always covers the frame)", () => {
      // min x = 320 − 640 = −320 ; min y = 320 − 320 = 0.
      expect(clampOffset({ x: -900, y: -50 }, scale, PAYSAGE, FRAME)).toEqual({ x: -320, y: 0 });
    });
  });

  describe('centeredOffset', () => {
    it("centers the surplus on the long axis, pins the fitted axis", () => {
      expect(centeredOffset(0.8, PAYSAGE, FRAME)).toEqual({ x: -160, y: 0 });
    });
  });

  describe('zoomedOffset', () => {
    it('keeps the point at the frame center fixed', () => {
      // Au centre du cadre (160,160) avec offset (−160,0) et échelle 0.8,
      // le point d'image est (400,200). À l'échelle 1.6 il doit y rester :
      // offset' = 160 − 400×1.6 = −480 (x), 160 − 200×1.6 = −160 (y).
      expect(zoomedOffset({ x: -160, y: 0 }, 0.8, 1.6, FRAME)).toEqual({ x: -480, y: -160 });
    });

    it('is neutral when the scale does not change', () => {
      expect(zoomedOffset({ x: -42, y: -7 }, 0.8, 0.8, FRAME)).toEqual({ x: -42, y: -7 });
    });
  });

  describe('sourceRect', () => {
    it('converts frame → natural pixels', () => {
      // offset (−160,0), échelle 0.8 : le cadre voit l'image depuis (200,0)
      // sur 400×400 px naturels.
      expect(sourceRect({ x: -160, y: 0 }, 0.8, FRAME)).toEqual({
        x: 200,
        y: 0,
        width: 400,
        height: 400,
      });
    });

    it('stays within the image bounds for a clamped offset', () => {
      // Offset extrême clampé (−320, 0) : source (400,0)+400×400 — le bord
      // droit tombe exactement sur width=800.
      const rect = sourceRect({ x: -320, y: 0 }, 0.8, FRAME);
      expect(rect.x + rect.width).toBe(PAYSAGE.width);
      expect(rect.y + rect.height).toBe(PAYSAGE.height);
    });
  });
});
