import { test as setup } from '@playwright/test'
import pc from 'picocolors'
import { compileMain } from '../scripts/server-utils.js'

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

  console.log(pc.blue('Compiling Electron main process...\n'))
  await compileMain()

  console.log(pc.green('\n======================================='))
  console.log(pc.green(`✔ Setup completed - Duration: ${Date.now() - start}ms`))
  console.log(pc.green('=======================================\n'))
})
