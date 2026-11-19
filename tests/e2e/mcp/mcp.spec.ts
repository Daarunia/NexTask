import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { callTool, enableMcp, MCP_URL, mcpRequest, mcpToken } from '../../helpers/mcp.helper'

/**
 * Tests E2E de l'accès MCP des assistants IA : section des Paramètres,
 * serveur sur 127.0.0.1 protégé par un jeton, outils qui agissent sur la base
 * de l'app, et tableau rafraîchi après les écritures d'un assistant.
 *
 * Le port MCP est imposé en test, un par worker (cf. mcp.constants.ts).
 */

test.describe('Paramètres', () => {
  test('désactivé par défaut, à l’écoute une fois activé', async ({ header, settingsPage }) => {
    await header.goSettings()
    await expect(settingsPage.mcpSwitch).not.toBeChecked()
    await expect(settingsPage.mcpStatusRow).toContainText('aucun assistant ne peut se connecter')

    await settingsPage.mcpSwitch.click()

    await expect(settingsPage.mcpSwitch).toBeChecked()
    await expect(settingsPage.mcpStatusRow).toContainText(`À l’écoute sur ${MCP_URL}`)
  })

  test('affiche le jeton à la demande, et le régénère après confirmation', async ({ page, header, settingsPage }) => {
    await enableMcp(page)
    const before = await mcpToken(page)
    await header.goSettings()

    await expect(settingsPage.mcpToken).not.toContainText(before)
    await settingsPage.mcpShowTokenButton.click()
    await expect(settingsPage.mcpToken).toHaveText(before)

    await settingsPage.mcpRegenerateButton.click()
    await settingsPage.confirmAcceptButton.click()

    await expect(settingsPage.mcpToken).not.toHaveText(before)
    const after = await mcpToken(page)
    await expect(settingsPage.mcpToken).toHaveText(after)

    // L'ancien jeton ne passe plus
    expect((await mcpRequest(page.request, before, 'tools/list')).status()).toBe(401)
    expect((await mcpRequest(page.request, after, 'tools/list')).status()).toBe(200)
  })

  test('copie la commande Claude Code, jeton compris', async ({ page, electronApp, header, settingsPage }) => {
    await enableMcp(page)
    const token = await mcpToken(page)
    await header.goSettings()

    await settingsPage.mcpCopyClaudeCodeButton.click()

    await expect
      .poll(() => electronApp.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(`claude mcp add --transport http nextask ${MCP_URL} --header "Authorization: Bearer ${token}"`)
  })
})

test.describe('Serveur MCP', () => {
  test('n’écoute pas tant que l’accès est désactivé', async ({ page }) => {
    await expect(mcpRequest(page.request, 'x', 'tools/list')).rejects.toThrow()
  })

  test('refuse une requête sans jeton', async ({ page }) => {
    await enableMcp(page)
    expect((await mcpRequest(page.request, null, 'tools/list')).status()).toBe(401)
  })

  test('les outils lisent et écrivent la base de l’app', async ({ page }) => {
    await enableMcp(page)
    const token = await mcpToken(page)

    const overview = await callTool(page.request, token, 'overview')
    expect(overview.boards[0].columns.map((column: { name: string }) => column.name)).toContain('A faire')

    const captured = await callTool(page.request, token, 'capture', { text: 'Idée MCP\nNote prise par un assistant' })
    const stored = await (await page.request.get(`${API}/tasks/${captured.id}`)).json()
    expect(stored).toMatchObject({ title: 'Idée MCP', description: 'Note prise par un assistant' })

    const found = await callTool(page.request, token, 'search_tasks', { query: 'assistant' })
    expect(found.tasks.map((item: { id: number }) => item.id)).toEqual([captured.id])

    await callTool(page.request, token, 'archive_task', { id: captured.id })
    expect((await (await page.request.get(`${API}/tasks/${captured.id}`)).json()).isHistorized).toBe(true)
  })

  test('crée une tâche à sa place par défaut, version des paramètres', async ({ page }) => {
    await enableMcp(page)
    const token = await mcpToken(page)

    const created = await callTool(page.request, token, 'create_task', {
      title: 'Créée par MCP',
      column: 'En cours',
      tags: ['Assistant'],
      checklist: ['Étape 1'],
    })

    const stored = await (await page.request.get(`${API}/tasks/${created.id}`)).json()
    expect(stored).toMatchObject({ title: 'Créée par MCP', version: '1.5.0', position: 0 })
    expect(stored.tags.map((tag: { name: string }) => tag.name)).toEqual(['Assistant'])
    expect(stored.checklist.items.map((item: { text: string }) => item.text)).toEqual(['Étape 1'])
  })
})

test.describe('Rafraîchissement', () => {
  test('une tâche capturée par un assistant apparaît sur le tableau sans recharger', async ({ page, taskBoard }) => {
    await enableMcp(page)
    const token = await mcpToken(page)

    await callTool(page.request, token, 'capture', { text: 'Vue en direct' })

    await expect(taskBoard.taskCard('Vue en direct')).toBeVisible()
  })

  test('une tâche archivée par un assistant quitte le tableau', async ({ page, taskBoard }) => {
    await enableMcp(page)
    const token = await mcpToken(page)
    const { id } = await callTool(page.request, token, 'capture', { text: 'À archiver' })
    await expect(taskBoard.taskCard('À archiver')).toBeVisible()

    await callTool(page.request, token, 'archive_task', { id })

    await expect(taskBoard.taskCard('À archiver')).toHaveCount(0)
  })
})
