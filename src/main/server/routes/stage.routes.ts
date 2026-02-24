import { prisma } from "../prismaClient.js";
import { stageSchema } from "../schemas/stageShema.js";

/**
 * Plugin de routes Fastify pour la gestion des stages (Stage)
 *
 * Fournit les endpoints CRUD pour l'entité `Stage` :
 * - GET    /stages       → Liste toutes les stages
 * - GET    /stages/:id   → Récupère une stage par son ID
 * - POST   /stages       → Crée une nouvelle stage
 * - PATCH  /stages/:id   → Modifie une stage existante
 * - DELETE /stages/:id   → Supprime une stage existante
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function stagesRoutes(fastify) {
  /**
   * GET /stages
   *
   * Récupère la liste complète des stages et des tâches liées.
   *
   * @returns {Promise<Array<Object>>} Tableau d'objets Stage
   */
  fastify.get(
    "/stages",
    {
      schema: {
        description: "Récupère toutes les colonnes avec leurs tâches",
        tags: ["Stage"],
        response: { 200: { type: "array", items: stageSchema } },
      },
    },
    async () => {
      return prisma.stage.findMany({
        include: {
          tasks: true,
        },
        orderBy: [{ id: "asc" }, { position: "asc" }],
      });
    },
  );

  /**
   * GET /stages/:id
   *
   * Récupère une stage unique par son identifiant.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la stage
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Objet Stage ou erreur
   */
  fastify.get(
    "/stages/:id",
    {
      schema: {
        description: "Récupère une stage par son ID",
        tags: ["Stage"],
        params: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
        response: {
          200: stageSchema,
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id);
      const stage = await prisma.stage.findUnique({ where: { id } });
      if (!stage) {
        reply.code(404);
        return { error: "Stage non trouvée" };
      }
      return stage;
    },
  );

  /**
   * PATCH /stages/:id
   *
   * Met à jour les informations d'une stage existante.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la stage
   * @param {Object} req.body - Données à mettre à jour
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Objet Stage mis à jour ou erreur
   */
  fastify.patch(
    "/stages/:id",
    {
      schema: {
        description: "Met à jour une stage existante",
        tags: ["Stage"],
        params: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            position: { type: "integer" },
          },
        },
        response: {
          200: stageSchema,
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id);
      try {
        return await prisma.stage.update({
          where: { id },
          data: req.body,
        });
      } catch {
        reply.code(404);
        return { error: "Stage non trouvée" };
      }
    },
  );

  /**
   * DELETE /stages/:id
   *
   * Supprime une stage par son ID.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la stage
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<{message: string}|{error: string}>} Message de succès ou erreur
   */
  fastify.delete(
    "/stages/:id",
    {
      schema: {
        description: "Supprime une stage par son ID",
        tags: ["Stage"],
        params: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
        response: {
          200: { type: "object", properties: { message: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id);
      try {
        await prisma.stage.delete({ where: { id } });
        return { message: "Stage supprimée" };
      } catch {
        reply.code(404);
        return { error: "Stage non trouvée" };
      }
    },
  );

  /**
   * POST /stages
   *
   * Crée une nouvelle stage avec les données fournies.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.body - Corps de la requête
   * @param {string} req.body.position - Position
   * @param {string} req.body.name - Nom
   * @returns {Promise<Object>} Objet Stage créé
   */
  fastify.post(
    "/stages",
    {
      schema: {
        description: "Crée une nouvelle stage",
        tags: ["Stage"],
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            position: { type: "integer" },
          },
          required: ["name", "position"],
        },
        response: { 200: stageSchema },
      },
    },
    async (req) => {
      return prisma.stage.create({ data: req.body });
    },
  );
}
