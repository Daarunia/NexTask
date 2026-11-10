import { dataSettings, saveDataSettings } from '../../database/serverSettings.js'
import { DATA_SETTINGS_SCHEMA, type DataSettings } from '../../shared/settings.schema.js'
import { errorResponse } from '../schemas/common.js'

// Réglages « données » complets, tels que renvoyés par les deux routes
const settingsResponse = {
  type: 'object',
  properties: DATA_SETTINGS_SCHEMA,
}

/**
 * Plugin de routes Fastify des réglages « données » du serveur autonome, gardés
 * en base (cf. database/serverSettings.ts). Enregistré par le serveur seulement :
 * l'app desktop garde ses réglages dans electron-store et ne l'expose pas.
 *
 * - GET   /settings → Réglages courants
 * - PATCH /settings → Change un ou plusieurs réglages
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function settingsRoutes(fastify) {
  /**
   * GET /settings
   *
   * @returns {Promise<Object>} Réglages courants
   */
  fastify.get(
    '/settings',
    {
      schema: {
        description: 'Réglages « données » du serveur',
        tags: ['Settings'],
        response: { 200: settingsResponse },
      },
    },
    async () => dataSettings(),
  )

  /**
   * PATCH /settings
   *
   * Change les réglages présents dans le corps, chacun validé par son schéma.
   * La version par défaut doit rester une des versions proposées.
   *
   * @param {Object} req.body - Réglages changés
   * @returns {Promise<Object>} Réglages courants après le changement
   */
  fastify.patch(
    '/settings',
    {
      schema: {
        description: 'Change un ou plusieurs réglages « données » du serveur',
        tags: ['Settings'],
        body: {
          type: 'object',
          properties: DATA_SETTINGS_SCHEMA,
          additionalProperties: false,
        },
        response: { 200: settingsResponse, 400: errorResponse },
      },
    },
    async (req, reply) => {
      const changes = req.body as Partial<DataSettings>
      if (Object.keys(changes).length === 0) {
        reply.code(400)
        return { error: 'Aucun réglage à changer' }
      }

      const next = { ...dataSettings(), ...changes }
      if (!next.taskVersions.includes(next.defaultTaskVersion)) {
        reply.code(400)
        return { error: 'La version par défaut doit faire partie des versions proposées' }
      }

      return saveDataSettings(changes)
    },
  )
}
