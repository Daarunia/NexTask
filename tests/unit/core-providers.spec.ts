import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ServerSettings } from '@core/settings'
import type { Locale } from '@core/shared/settings.constants'

/** Modules de core rechargés à chaque test : aucun fournisseur ne reste branché d'un test à l'autre. */
async function loadCore() {
  vi.resetModules()
  const settingsModule = await import('@core/settings')
  const i18nModule = await import('@core/i18n')
  return { ...settingsModule, ...i18nModule }
}

const SETTINGS: ServerSettings = {
  taskVersions: ['1.0'],
  defaultTaskVersion: '1.0',
  newTaskPosition: 'bottom',
  lastBoardId: null,
  archivePurgeEnabled: false,
  archivePurgeDays: 30,
  autoBackupEnabled: true,
  documentMaxSizeMb: 20,
  documentMaxPerTask: 10,
}

describe('réglages de core', () => {
  beforeEach(() => vi.resetModules())

  test('settings() lève une erreur explicite sans fournisseur', async () => {
    const { settings } = await loadCore()
    expect(() => settings()).toThrow(/setSettingsProvider\(\)/)
  })

  test('settings() relit le fournisseur à chaque appel', async () => {
    const { setSettingsProvider, settings } = await loadCore()
    let current: ServerSettings = SETTINGS
    setSettingsProvider(() => current)
    expect(settings().newTaskPosition).toBe('bottom')
    current = { ...SETTINGS, newTaskPosition: 'top' }
    expect(settings().newTaskPosition).toBe('top')
  })
})

describe('textes de core', () => {
  beforeEach(() => vi.resetModules())

  test('t() lève une erreur explicite sans langue branchée', async () => {
    const { t } = await loadCore()
    expect(() => t('boards.defaultName')).toThrow(/setLocaleProvider\(\)/)
  })

  test('t() suit la langue branchée, relue à chaque traduction', async () => {
    const { setLocaleProvider, t } = await loadCore()
    let locale: Locale = 'fr'
    setLocaleProvider(() => locale)
    expect(t('boards.defaultStages.todo')).toBe('A faire')
    locale = 'en'
    expect(t('boards.defaultStages.todo')).not.toBe('A faire')
  })

  test('translate() remplace les paramètres, quelle que soit la langue branchée', async () => {
    const { translate } = await loadCore()
    expect(translate('fr', 'checklists.copyName', { name: 'Courses' })).toBe('Courses (copie)')
  })
})
