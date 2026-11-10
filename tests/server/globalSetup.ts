import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { docker, IMAGE, TEST_LABEL } from './helpers/docker'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Retire les conteneurs et volumes laissés par les tests (y compris un passage interrompu). */
function cleanUp(): void {
  const containers = docker(['ps', '--all', '--quiet', '--filter', `label=${TEST_LABEL}`], true)
  if (containers) docker(['rm', '--force', ...containers.split('\n')], true)

  const volumes = docker(['volume', 'ls', '--quiet', '--filter', 'name=nextask-test-'], true)
  if (volumes) docker(['volume', 'rm', '--force', ...volumes.split('\n')], true)
}

/**
 * Prépare les tests du serveur : Docker joignable, image construite depuis le
 * dépôt (sauf image fournie par NEXTASK_SERVER_IMAGE), restes d'un passage
 * précédent retirés. Rend le ménage de fin.
 */
export default function setup(): () => void {
  try {
    docker(['version', '--format', '{{.Server.Version}}'])
  } catch {
    throw new Error('Docker est introuvable ou arrêté : les tests du serveur lancent son image')
  }

  if (!process.env.NEXTASK_SERVER_IMAGE) {
    // Construction de l'image testée, avec le cache de Docker : seules les
    // étapes touchées par un changement se refont
    docker(['build', '--quiet', '--tag', IMAGE, ROOT])
  }

  cleanUp()
  return cleanUp
}
