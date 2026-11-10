import type { APIRequestContext, Page } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { TEST_BRIDGE_GLOBAL } from '@core/shared/test.constants'
import type { AppSettings } from '@core/shared/settings.constants'
import { isDataSettingsKey } from '@core/shared/settings.schema'
import type { DesktopTestBridge } from '../../src/main/system/testBridge'
import { API, API_HEADERS, IS_REMOTE } from './api.helper'

/**
 * Pilotage du processus principal de l'app en test : appels au pont de test
 * (cf. src/main/system/testBridge.ts) par `electronApp.evaluate()`, et remise
 * à zéro complète (main puis données).
 */

type BridgeMethod = keyof DesktopTestBridge

/**
 * Appelle une fonction du pont de test du main.
 *
 * @param electronApp App lancée par la fixture
 * @param name Fonction du pont
 * @param args Ses arguments (sérialisables)
 * @returns Son résultat
 */
export function desktop<K extends BridgeMethod>(
  electronApp: ElectronApplication,
  name: K,
  ...args: Parameters<DesktopTestBridge[K]>
): Promise<Awaited<ReturnType<DesktopTestBridge[K]>>> {
  return electronApp.evaluate(
    // Fonction sérialisée vers le main : rien de ce module n'y est visible, d'où le nom global passé en argument
    (_electron, [global, method, params]) =>
      ((globalThis as Record<string, any>)[global] as Record<string, (...a: unknown[]) => unknown>)[method](...params),
    [TEST_BRIDGE_GLOBAL, name, args] as [string, string, unknown[]],
  ) as Promise<Awaited<ReturnType<DesktopTestBridge[K]>>>
}

/** Options de la remise à zéro des données (cf. POST /test/reset). */
export interface ResetOptions {
  seedTags?: boolean // garder les tags par défaut
  seedTemplates?: boolean // garder les modèles de checklist par défaut
}

/**
 * Remet l'app à zéro : état du main (paramètres, ouvertures notées, fenêtre
 * d'ajout rapide…) puis données, dont les seeds suivent la langue de
 * l'interface revenue à sa valeur par défaut.
 *
 * @param electronApp App lancée par la fixture
 * @param request Contexte de requête vers l'API
 * @param options Tags et modèles de checklist par défaut gardés
 * @throws Si l'API refuse la remise à zéro
 */
export async function resetApp(
  electronApp: ElectronApplication,
  request: APIRequestContext,
  options: ResetOptions = {},
): Promise<void> {
  const { locale } = await desktop(electronApp, 'reset')

  const query = new URLSearchParams()
  if (options.seedTags) query.set('seedTags', 'true')
  if (options.seedTemplates) query.set('seedTemplates', 'true')
  const suffix = query.size ? `?${query}` : ''

  const res = await request.post(`${API}/test/reset${suffix}`, {
    headers: { ...API_HEADERS, 'accept-language': locale },
  })
  if (!res.ok()) throw new Error(`Remise à zéro refusée (${res.status()}) : ${await res.text()}`)
}

/**
 * Paramètres enregistrés, comme l'interface les lit : ceux du pont des
 * paramètres (electron-store), et en mode `remote` les réglages « données » du
 * serveur (GET /settings) par-dessus.
 *
 * @param page Fenêtre de l'app, qui porte le pont des paramètres
 */
export async function storedSettings(page: Page): Promise<AppSettings> {
  const device = await page.evaluate(() => (globalThis as any).settings.getAll() as Promise<AppSettings>)
  if (!IS_REMOTE) return device
  const res = await page.request.get(`${API}/settings`, { headers: API_HEADERS })
  if (!res.ok()) throw new Error(`Réglages du serveur illisibles (${res.status()})`)
  return { ...device, ...((await res.json()) as Partial<AppSettings>) }
}

/**
 * Change un paramètre comme l'interface : par le pont des paramètres, sauf les
 * réglages « données » de NexTask Client (mode `remote`), gardés par le
 * serveur (PATCH /settings). La page n'est pas mise à jour : la recharger
 * pour qu'elle relise le paramètre.
 *
 * @param page Fenêtre de l'app, qui porte le pont des paramètres
 * @param key Paramètre
 * @param value Nouvelle valeur
 * @throws Si le serveur refuse la valeur
 */
export async function setSetting<K extends keyof AppSettings>(
  page: Page,
  key: K,
  value: AppSettings[K],
): Promise<void> {
  if (IS_REMOTE && isDataSettingsKey(key)) {
    const res = await page.request.patch(`${API}/settings`, { data: { [key]: value }, headers: API_HEADERS })
    if (!res.ok()) throw new Error(`Réglage ${key} refusé (${res.status()}) : ${await res.text()}`)
    return
  }
  await page.evaluate(([name, next]) => (globalThis as any).settings.set(name, next), [key, value] as const)
}
