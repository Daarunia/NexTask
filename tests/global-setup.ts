import path from 'node:path'
import { test as setup } from '@playwright/test'
import pc from 'picocolors'
import { compileMain } from '../scripts/server-utils.js'
import { IS_REMOTE } from './helpers/api.helper'
import { docker, REMOTE_IMAGE, removeRemoteContainers } from './helpers/remote.helper'

// jcp --ignore-checks le fichier doit être ignoré par le pre-commit

// Compilation complète (main, preload, renderer), plus longue qu'un test
const COMPILE_TIMEOUT = 300000

// Projet « setup » de playwright.config.ts, dont dépendent les tests E2E
setup('compile Electron main process', async () => {
  setup.setTimeout(COMPILE_TIMEOUT)
  const start = Date.now()

  // Electron ne télécharge son binaire qu'au premier import du paquet (pas à
  // l'installation) : fait ici une seule fois, avant que les workers ne le
  // téléchargent chacun en même temps dans le même dossier et lancent un
  // exécutable incomplet (premier test en échec en CI)
  await import('electron')

  // Mode remote : NexTask Client, et l'image de test du serveur (avec le cache
  // de Docker, seules les étapes touchées se refont), conteneurs d'un passage
  // interrompu retirés
  if (IS_REMOTE) {
    process.env.NEXTASK_EDITION = 'client'
    try {
      docker(['version', '--format', '{{.Server.Version}}'])
    } catch {
      throw new Error('Docker est introuvable ou arrêté : le mode remote lance un conteneur du serveur par worker')
    }
    removeRemoteContainers()
    if (!process.env.NEXTASK_SERVER_TEST_IMAGE) {
      console.log(pc.blue(`Building ${REMOTE_IMAGE}...\n`))
      docker(['build', '--quiet', '--target', 'test', '--tag', REMOTE_IMAGE, path.resolve(import.meta.dirname, '..')])
    }
  }

  console.log(pc.blue(`Compiling Electron main process (${IS_REMOTE ? 'client' : 'local'} edition)...\n`))
  await compileMain()

  console.log(pc.green('\n======================================='))
  console.log(pc.green(`✔ Setup completed - Duration: ${Date.now() - start}ms`))
  console.log(pc.green('=======================================\n'))
})
