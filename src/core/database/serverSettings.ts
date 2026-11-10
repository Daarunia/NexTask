import Logger from '../logger.js'
import { prisma } from '../server/prismaClient.js'
import { DEFAULT_SETTINGS } from '../shared/settings.constants.js'
import { DATA_SETTINGS_KEYS, type DataSettings, isDataSettingsKey } from '../shared/settings.schema.js'

/**
 * Réglages « données » du serveur autonome, gardés en base (table
 * ServerSetting, une ligne par réglage changé, valeur en JSON).
 *
 * `settings()` de core reste synchrone : les réglages sont lus une fois au
 * démarrage (loadDataSettings), puis tenus à jour en mémoire à chaque écriture
 * (saveDataSettings), seule voie pour les changer. L'app desktop n'utilise pas
 * ce module : ses réglages restent dans electron-store.
 */

let cache: DataSettings | null = null

/** Valeurs par défaut des réglages « données ». */
function defaultDataSettings(): DataSettings {
  return Object.fromEntries(
    DATA_SETTINGS_KEYS.map((key) => [key, structuredClone(DEFAULT_SETTINGS[key])]),
  ) as DataSettings
}

/**
 * Lit les réglages en base, valeurs par défaut pour ceux jamais changés, et les
 * garde en mémoire. Une ligne illisible ou d'une clé inconnue est ignorée.
 *
 * @returns Réglages courants
 */
export async function loadDataSettings(): Promise<DataSettings> {
  const values: Record<string, unknown> = defaultDataSettings()

  for (const row of await prisma.serverSetting.findMany()) {
    if (!isDataSettingsKey(row.key)) continue
    try {
      values[row.key] = JSON.parse(row.value)
    } catch {
      Logger.warn(`[réglages] Valeur illisible pour ${row.key}, valeur par défaut gardée`)
    }
  }

  cache = values as DataSettings
  return cache
}

/**
 * Réglages courants, tels que lus au démarrage puis changés.
 *
 * @throws Si loadDataSettings() n'a pas encore été appelé
 */
export function dataSettings(): DataSettings {
  if (!cache) throw new Error('Réglages non chargés : loadDataSettings() doit être appelé au démarrage')
  return cache
}

/**
 * Remet tous les réglages à leurs valeurs par défaut, en base et en mémoire
 * (remise à zéro des tests E2E sur le serveur autonome).
 *
 * @returns Réglages par défaut
 */
export async function resetDataSettings(): Promise<DataSettings> {
  await prisma.serverSetting.deleteMany()
  return loadDataSettings()
}

/**
 * Enregistre un changement de réglages, en une transaction, puis le reporte en
 * mémoire. Les valeurs doivent avoir été validées (cf. DATA_SETTINGS_SCHEMA).
 *
 * @param changes Réglages changés ; une clé inconnue est ignorée
 * @returns Réglages courants après le changement
 */
export async function saveDataSettings(changes: Partial<DataSettings>): Promise<DataSettings> {
  const current = dataSettings()
  const entries = Object.entries(changes).filter(([key]) => isDataSettingsKey(key))

  await prisma.$transaction(
    entries.map(([key, value]) => {
      const json = JSON.stringify(value)
      return prisma.serverSetting.upsert({ where: { key }, create: { key, value: json }, update: { value: json } })
    }),
  )

  cache = { ...current, ...Object.fromEntries(entries) }
  Logger.info(`[réglages] Changés : ${entries.map(([key]) => key).join(', ')}`)
  return cache
}
