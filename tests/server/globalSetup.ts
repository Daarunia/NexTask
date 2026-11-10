import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { docker, IMAGE, TEST_LABEL, TEST_MODE_IMAGE } from './helpers/docker'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Retire les conteneurs et volumes laissés par les tests (y compris un passage interrompu). */
function cleanUp(): void {
  const containers = docker(['ps', '--all', '--quiet', '--filter', `label=${TEST_LABEL}`], true)
  if (containers) docker(['rm', '--force', ...containers.split('\n')], true)

  const volumes = docker(['volume', 'ls', '--quiet', '--filter', 'name=nextask-test-'], true)
  if (volumes) docker(['volume', 'rm', '--force', ...volumes.split('\n')], true)
}

/**
 * Prépare les tests du serveur : Docker joignable, images publiée et de test
 * construites depuis le dépôt (sauf images fournies par NEXTASK_SERVER_IMAGE
 * et NEXTASK_SERVER_TEST_IMAGE), restes d'un passage précédent retirés. Rend
 * le ménage de fin.
 */
export default function setup(): () => void {
  try {
    docker(['version', '--format', '{{.Server.Version}}'])
  } catch {
    throw new Error('Docker est introuvable ou arrêté : les tests du serveur lancent son image')
  }

  // Construction des images, avec le cache de Docker : seules les étapes
  // touchées par un changement se refont, et les deux cibles partagent les leurs
  if (!process.env.NEXTASK_SERVER_IMAGE) {
    docker(['build', '--quiet', '--tag', IMAGE, ROOT])
  }
  if (!process.env.NEXTASK_SERVER_TEST_IMAGE) {
    docker(['build', '--quiet', '--target', 'test', '--tag', TEST_MODE_IMAGE, ROOT])
  }

  cleanUp()
  return cleanUp
}
