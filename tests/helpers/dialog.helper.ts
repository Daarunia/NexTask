import type { ElectronApplication } from 'playwright'

/**
 * Remplacement des boîtes de dialogue natives de fichiers dans le process
 * main, impossibles à piloter depuis Playwright. Le main appelle
 * `dialog.showSaveDialog` / `dialog.showOpenDialog` sur l'objet du module
 * `electron`, que ces helpers modifient : le prochain appel répond aussitôt
 * avec le fichier donné, sans rien afficher.
 *
 * L'app étant partagée par tous les tests du worker, `restoreDialogs` remet
 * les vraies boîtes de dialogue en fin de test.
 */

/**
 * Mémorise les vraies boîtes de dialogue, une seule fois par lancement de l'app.
 * @param app Application Electron
 */
async function keepOriginals(app: ElectronApplication) {
  await app.evaluate(({ dialog }) => {
    const store = globalThis as { __originalDialogs?: Partial<typeof dialog> }
    store.__originalDialogs ??= { showSaveDialog: dialog.showSaveDialog, showOpenDialog: dialog.showOpenDialog }
  })
}

/**
 * La boîte « Enregistrer sous » répond le fichier donné, ou une annulation.
 * @param app Application Electron
 * @param filePath Fichier « choisi », `null` pour annuler
 */
export async function stubSaveDialog(app: ElectronApplication, filePath: string | null) {
  await keepOriginals(app)
  await app.evaluate(({ dialog }, target) => {
    const answer = target ? { canceled: false, filePath: target } : { canceled: true, filePath: '' }
    dialog.showSaveDialog = (async () => answer) as unknown as typeof dialog.showSaveDialog
  }, filePath)
}

/**
 * La boîte « Ouvrir » répond le fichier donné, ou une annulation.
 * @param app Application Electron
 * @param filePath Fichier « choisi », `null` pour annuler
 */
export async function stubOpenDialog(app: ElectronApplication, filePath: string | null) {
  await keepOriginals(app)
  await app.evaluate(({ dialog }, target) => {
    const answer = target ? { canceled: false, filePaths: [target] } : { canceled: true, filePaths: [] }
    dialog.showOpenDialog = (async () => answer) as unknown as typeof dialog.showOpenDialog
  }, filePath)
}

/**
 * Remet les vraies boîtes de dialogue.
 * @param app Application Electron
 */
export async function restoreDialogs(app: ElectronApplication) {
  await app.evaluate(({ dialog }) => {
    const store = globalThis as { __originalDialogs?: Partial<typeof dialog> }
    if (store.__originalDialogs) Object.assign(dialog, store.__originalDialogs)
  })
}
