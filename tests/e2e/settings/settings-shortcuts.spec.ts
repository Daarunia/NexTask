import { test, expect } from '../../fixtures/test'

/**
 * Tests E2E de l'aide-mémoire des raccourcis clavier, dans les Paramètres :
 * une ligne par raccourci, touches nommées dans la langue de l'interface.
 */

test('liste les raccourcis du tableau et du dialogue', async ({ page, header }) => {
  await header.goSettings()

  const rows = page.getByTestId('settings-shortcuts').getByTestId('shortcut-row')
  await expect(rows).toHaveCount(11)
  await expect(rows.first()).toContainText('Rechercher dans le tableau')
  await expect(rows.first().locator('kbd')).toHaveText(['Ctrl', 'F'])
  await expect(rows.filter({ hasText: 'Archiver la carte' }).locator('kbd')).toHaveText(['Suppr'])
  await expect(rows.filter({ hasText: 'Enregistrer et créer' }).locator('kbd')).toHaveText(['Ctrl', 'Maj', 'Entrée'])
})
