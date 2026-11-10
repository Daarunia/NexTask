import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

/**
 * Pilotage de Docker pour les tests du serveur : conteneurs de l'image testée,
 * chacun sur un port libre et son propre volume de données, retirés à la fin.
 *
 * Tout passe par le CLI `docker`, appelé sans shell (arguments en tableau).
 */

/** Image testée, construite par globalSetup.ts (ou fournie par NEXTASK_SERVER_IMAGE). */
export const IMAGE = process.env.NEXTASK_SERVER_IMAGE || 'nextask-server:test'

/** Étiquette posée sur tout ce que les tests créent, pour le ménage. */
export const TEST_LABEL = 'nextask.test=server'

/** Jeton des conteneurs de test. */
export const TOKEN = `test-token-${'x'.repeat(32)}`

/**
 * Lance une commande docker et rend sa sortie, sans espaces de fin.
 *
 * @param args Arguments de la commande
 * @param allowFailure Rendre la sortie d'erreur au lieu de lever en cas d'échec
 */
export function docker(args: string[], allowFailure = false): string {
  try {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    if (!allowFailure) throw error
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string }
    return `${stdout}${stderr}`.trim()
  }
}

/** Attend `ms` millisecondes. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Options d'un conteneur de test. */
export interface ContainerOptions {
  env?: Record<string, string> // variables ajoutées ou remplaçant celles par défaut
  volume?: string // volume de données à reprendre (celui d'un conteneur précédent)
  dockerArgs?: string[] // arguments de `docker run` en plus
}

/** Conteneur du serveur lancé par un test. */
export class ServerContainer {
  readonly name = `nextask-test-${randomUUID().slice(0, 8)}`
  readonly volume: string
  url = ''

  constructor(private readonly options: ContainerOptions = {}) {
    this.volume = options.volume ?? `${this.name}-data`
  }

  /** Démarre le conteneur, sans attendre qu'il réponde. */
  start(): this {
    const env = { NEXTASK_TOKEN: TOKEN, NEXTASK_LOCALE: 'fr', ...this.options.env }
    docker([
      'run',
      '--detach',
      '--name',
      this.name,
      '--label',
      TEST_LABEL,
      '--publish',
      '127.0.0.1::3000',
      '--volume',
      `${this.volume}:/data`,
      ...Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
      ...(this.options.dockerArgs ?? []),
      IMAGE,
    ])
    return this
  }

  /** Port de l'hôte publié pour le port 3000 du conteneur. */
  private hostPort(): string {
    const mapping = docker(['port', this.name, '3000/tcp']).split('\n')[0]
    return mapping.slice(mapping.lastIndexOf(':') + 1)
  }

  /**
   * Attend que le serveur réponde sur /health.
   *
   * @param timeoutMs Délai maximal
   * @throws Si le serveur ne répond pas à temps, journaux du conteneur à l'appui
   */
  async ready(timeoutMs = 30_000): Promise<this> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (this.state().status === 'running') {
        this.url = `http://127.0.0.1:${this.hostPort()}`
        try {
          if ((await fetch(`${this.url}/health`)).ok) return this
        } catch {
          // Pas encore à l'écoute
        }
      }
      await wait(250)
    }
    throw new Error(`Le serveur ${this.name} ne répond pas :\n${this.logs()}`)
  }

  /**
   * Requête sur l'API, jeton compris sauf `headers.authorization` explicite.
   *
   * @param path Chemin de la route
   * @param init Options de fetch
   */
  request(path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
    const headers = { authorization: `Bearer ${TOKEN}`, ...init.headers }
    return fetch(`${this.url}${path}`, { ...init, headers })
  }

  /**
   * Requête JSON sur l'API, corps envoyé en JSON.
   *
   * @param method Méthode HTTP
   * @param path Chemin de la route
   * @param body Corps de la requête
   * @param headers En-têtes en plus
   */
  json(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return this.request(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    })
  }

  /** État du conteneur : statut, code de sortie, santé. */
  state(): { status: string; exitCode: number; health: string } {
    const [status, exitCode, health] = docker([
      'inspect',
      '--format',
      '{{.State.Status}}|{{.State.ExitCode}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}',
      this.name,
    ]).split('|')
    return { status, exitCode: Number(exitCode), health }
  }

  /**
   * Attend un état du conteneur.
   *
   * @param predicate Condition sur l'état
   * @param timeoutMs Délai maximal
   */
  async waitFor(predicate: (state: ReturnType<ServerContainer['state']>) => boolean, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const state = this.state()
      if (predicate(state)) return state
      await wait(250)
    }
    throw new Error(`État attendu non atteint pour ${this.name} : ${JSON.stringify(this.state())}\n${this.logs()}`)
  }

  /**
   * Journaux du conteneur. `docker logs` rend la sortie d'erreur du conteneur
   * (avertissements, erreurs) sur sa propre sortie d'erreur : les deux sont lues.
   */
  logs(): string {
    const { stdout, stderr } = spawnSync('docker', ['logs', this.name], { encoding: 'utf8' })
    return `${stdout}${stderr}`.trim()
  }

  /** Arrête le conteneur comme `docker stop` (SIGTERM, puis SIGKILL après le délai). */
  stop(): void {
    docker(['stop', '--time', '20', this.name])
  }

  /** Redémarre le conteneur arrêté, puis attend qu'il réponde. */
  async restart(): Promise<this> {
    docker(['start', this.name])
    return this.ready()
  }

  /**
   * Commande lancée dans le volume des données, depuis un conteneur jetable de
   * l'image (le conteneur testé peut être arrêté).
   *
   * @param command Commande et arguments
   */
  inVolume(command: string[]): string {
    return docker([
      'run',
      '--rm',
      '--volume',
      `${this.volume}:/data`,
      '--entrypoint',
      command[0],
      IMAGE,
      ...command.slice(1),
    ])
  }

  /** Retire le conteneur, et son volume sauf `keepVolume`. */
  remove(keepVolume = false): void {
    docker(['rm', '--force', this.name], true)
    if (!keepVolume) docker(['volume', 'rm', '--force', this.volume], true)
  }
}
