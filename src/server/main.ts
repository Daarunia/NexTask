import Logger, { setLogger } from '../core/logger.js'
import { config } from '../core/config.js'
import { releaseLock } from '../core/database/lock.js'
import { startServer } from '../core/server/index.js'
import { prisma } from '../core/server/prismaClient.js'
import { startMaintenanceScheduler, stopMaintenanceScheduler } from '../core/scheduler/maintenanceScheduler.js'
import { startRecurrenceScheduler, stopRecurrenceScheduler } from '../core/scheduler/recurrenceScheduler.js'
import { initServerCore, prepareDatabase, serverBuildOptions } from './app.js'
import { readServerEnv, ServerEnvError } from './env.js'
import { serverLogger } from './logger.js'

/**
 * Point d'entrée du serveur autonome de NexTask : l'API de core, sans
 * Electron, sur un dossier de données (cf. env.ts pour les variables).
 *
 *   NEXTASK_TOKEN=… NEXTASK_DATA_DIR=./data node build/server/main.js
 */

setLogger(serverLogger)

/**
 * Démarre le serveur, puis les schedulers. Arrêt propre sur SIGTERM (docker
 * stop) et SIGINT (Ctrl+C) : schedulers, serveur, base, verrou.
 */
async function start(): Promise<void> {
  let env
  try {
    env = readServerEnv(process.env)
  } catch (error) {
    if (!(error instanceof ServerEnvError)) throw error
    Logger.error(`Configuration invalide : ${error.message}`)
    process.exitCode = 1
    return
  }

  initServerCore(env)
  await prepareDatabase(env)

  const fastify = await startServer({ ...serverBuildOptions(env), port: env.port, host: env.host })
  Logger.info(`NexTask ${config().appVersion} à l'écoute sur ${env.host}:${env.port}, données dans ${env.dataDir}`)

  startRecurrenceScheduler()
  startMaintenanceScheduler()

  let stopping = false
  const stop = async (signal: string) => {
    if (stopping) return
    stopping = true
    Logger.info(`${signal} reçu, arrêt du serveur`)

    stopRecurrenceScheduler()
    stopMaintenanceScheduler()
    try {
      await fastify.close()
      await prisma.$disconnect()
    } finally {
      releaseLock(config().dbPath)
    }
  }

  process.once('SIGTERM', () => void stop('SIGTERM'))
  process.once('SIGINT', () => void stop('SIGINT'))
}

start().catch((error) => {
  Logger.error('Échec du démarrage du serveur :', error)
  process.exitCode = 1
})
