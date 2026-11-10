import { execFileSync } from 'node:child_process'
import { API, REMOTE_TOKEN, TEST_INDEX } from './api.helper'
import { TEST_RENDERER_PORT } from './renderer.helper'

/**
 * Serveur des tests E2E en mode `remote` : un conteneur de l'image de test
 * (cible `test` du Dockerfile, routes de test ouvertes) par worker, publié sur
 * le port de son API (cf. api.helper.ts), retiré avec son volume à la fin du
 * worker.
 */

/** Image de test, construite par le projet « setup » (ou fournie par NEXTASK_SERVER_TEST_IMAGE). */
export const REMOTE_IMAGE = process.env.NEXTASK_SERVER_TEST_IMAGE || 'nextask-server:test-mode'

/** Étiquette des conteneurs des tests E2E, pour le ménage d'un passage interrompu. */
export const REMOTE_LABEL = 'nextask.test=e2e'

/**
 * Lance une commande docker et rend sa sortie.
 *
 * @param args Arguments de la commande
 */
export function docker(args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** Retire les conteneurs des tests E2E restés d'un passage précédent, volumes compris. */
export function removeRemoteContainers(): void {
  const ids = docker(['ps', '--all', '--quiet', '--filter', `label=${REMOTE_LABEL}`])
  if (ids) docker(['rm', '--force', '--volumes', ...ids.split('\n')])
}

/** Nom du conteneur de ce worker. */
function containerName(): string {
  return `nextask-e2e-${TEST_INDEX}-${process.pid}`
}

/**
 * Démarre le conteneur de ce worker et attend qu'il réponde.
 *
 * @throws Si le serveur ne répond pas à temps, journaux du conteneur à l'appui
 */
export async function startRemoteServer(): Promise<void> {
  const name = containerName()
  const port = new URL(API).port
  docker([
    'run',
    '--detach',
    '--name',
    name,
    '--label',
    REMOTE_LABEL,
    '--publish',
    `127.0.0.1:${port}:3000`,
    '--env',
    `NEXTASK_TOKEN=${REMOTE_TOKEN}`,
    '--env',
    'NEXTASK_LOCALE=fr',
    // Fuseau de la machine des tests : récurrences et rappels se calculent à
    // l'heure du serveur, que les tests attendent à l'heure locale
    '--env',
    `TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    // Renderer des tests servi en http (cf. renderer.helper.ts) : son origine doit
    // être autorisée, comme le serveur Vite pour l'API locale. L'app packagée,
    // chargée en file://, n'envoie pas d'en-tête Origin
    '--env',
    `NEXTASK_CORS_ORIGINS=http://localhost:${TEST_RENDERER_PORT}`,
    REMOTE_IMAGE,
  ])

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${API}/health`)).ok) return
    } catch {
      // Pas encore à l'écoute
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  let logs = ''
  try {
    logs = docker(['logs', name])
  } catch {
    // Conteneur déjà parti
  }
  throw new Error(`Le serveur ${name} ne répond pas sur ${API} :\n${logs}`)
}

/** Arrête le conteneur de ce worker (serveur injoignable), ses données gardées. */
export function haltRemoteServer(): void {
  docker(['stop', '--time', '5', containerName()])
}

/**
 * Redémarre le conteneur arrêté par haltRemoteServer, et attend qu'il réponde.
 *
 * @throws Si le serveur ne répond pas à temps
 */
export async function resumeRemoteServer(): Promise<void> {
  docker(['start', containerName()])
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${API}/health`)).ok) return
    } catch {
      // Pas encore à l'écoute
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Le serveur ${containerName()} ne répond pas après son redémarrage`)
}

/** Retire le conteneur de ce worker et son volume. */
export function stopRemoteServer(): void {
  try {
    docker(['rm', '--force', '--volumes', containerName()])
  } catch {
    // Déjà retiré
  }
}
