import { Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'

/**
 * Tests E2E du cache des stores (colonnes + tâches) côté renderer.
 *
 * Le TTL du cache est de 5 minutes : plutôt que d'attendre, on décale
 * `Date.now()` dans la page, c'est l'horloge que lisent les stores.
 */

const uid = () => Date.now().toString().slice(-6)
const MINUTE = 60 * 1000

/**
 * Décale l'horloge du renderer par rapport à l'heure réelle.
 * Le rechargement de page de la fixture `cleanState` remet l'horloge d'origine.
 * @param page Page courante
 * @param offset Décalage en millisecondes
 */
async function setClockOffset(page: Page, offset: number) {
  await page.evaluate((ms) => {
    const w = window as unknown as { __realNow?: () => number }
    w.__realNow ??= Date.now.bind(Date)
    const realNow = w.__realNow
    Date.now = () => realNow() + ms
  }, offset)
}

test.describe('Cache des colonnes et des tâches', () => {
  // Régression : une action sur une colonne rafraîchissait seulement le cache des
  // colonnes. Au retour sur le tableau, celui-ci était jugé valide et rien n'était
  // rechargé, alors que le cache des tâches avait expiré : colonnes vides
  test('affiche toujours les tâches au retour sur le tableau après expiration du cache', async ({
    page,
    header,
    taskBoard,
  }) => {
    const stage = `Cache ${uid()}`
    const renamed = `${stage} (renommée)`
    const task = `Tâche cache ${uid()}`

    await taskBoard.addStage(stage)
    await taskBoard.createTask(stage, { title: task })

    await setClockOffset(page, 3 * MINUTE)
    await taskBoard.renameStage(stage, renamed)

    // 5 min 30 après le chargement, 2 min 30 après le renommage
    await setClockOffset(page, 5.5 * MINUTE)

    await header.goSettings()
    await expect(header.homeButton).toBeVisible()
    await header.goHome()

    await expect(taskBoard.column(renamed)).toHaveCount(1)
    await expect(taskBoard.column(renamed).getByTestId('task-card')).toHaveCount(1)
    await expect(taskBoard.taskCard(task)).toBeVisible()
  })
})
