import { expect, type Locator } from '@playwright/test'

/**
 * Vérifie qu'une bulle (confirmation, popover) est ancrée sur son bouton :
 * juste au-dessous ou au-dessus de lui, à quelques pixels près, et à son
 * aplomb. Une bulle mal placée finit dans le coin de la fenêtre.
 * @param overlay Bulle affichée
 * @param anchor Bouton qui l'a ouverte
 */
export async function expectAnchoredTo(overlay: Locator, anchor: Locator) {
  await expect(async () => {
    const o = (await overlay.boundingBox())!
    const a = (await anchor.boundingBox())!

    const gapBelow = o.y - (a.y + a.height)
    const gapAbove = a.y - (o.y + o.height)
    expect(Math.min(Math.abs(gapBelow), Math.abs(gapAbove))).toBeLessThan(20)
    expect(o.x).toBeLessThan(a.x + a.width)
    expect(o.x + o.width).toBeGreaterThan(a.x)
  }).toPass({ timeout: 5000 })
}
