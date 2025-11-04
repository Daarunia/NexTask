import { prisma } from "../prismaClient.js";
import type { Task as PrismaTask } from "@prisma/client";

/**
 * Plugin de routes Fastify pour la gestion des tâches (Task)
 *
 * Fournit les endpoints CRUD pour l'entité `Task` :
 * - GET    /tasks       → Liste toutes les tâches
 * - GET    /tasks/:id   → Récupère une tâche par son ID
 * - POST   /tasks       → Crée une nouvelle tâche
 * - PATCH  /tasks/:id   → Modifie une tâche existante
 * - DELETE /tasks/:id   → Supprime une tâche existante
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function taskRoutes(fastify) {
  const taskSchema = {
    type: "object",
    properties: {
      id: { type: "integer" },
      stage: { type: "string" },
      version: { type: "string" },
      description: { type: "string" },
      title: { type: "string" },
      position: { type: "integer" },
      redmine: { type: "integer", nullable: true },
    },
  };

  /**
   * GET /tasks
   *
   * Récupère la liste complète des tâches.
   *
   * @returns {Promise<Array<Object>>} Tableau d'objets Task
   */
  fastify.get(
    "/tasks",
    {
      schema: {
        description: "Récupère toutes les tâches",
        tags: ["Task"],
        response: { 200: { type: "array", items: taskSchema } },
      },
    },
    async () => {
      return prisma.task.findMany({
        orderBy: [
          { stage: "asc" },
          { position: "asc" },
        ],
      });
    }
  );

  /**
   * GET /tasks/:id
   *
   * Récupère une tâche unique par son identifiant.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la tâche
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Objet Task ou erreur
   */
  fastify.get(
    "/tasks/:id",
    {
      schema: {
        description: "Récupère une tâche par son ID",
        tags: ["Task"],
        params: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
        response: {
          200: taskSchema,
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id);
      const task = await prisma.task.findUnique({ where: { id } });
      if (!task) {
        reply.code(404);
        return { error: "Tâche non trouvée" };
      }
      return task;
    }
  );

  /**
   * POST /tasks
   *
   * Crée une nouvelle tâche avec les données fournies.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.body - Corps de la requête
   * @param {string} req.body.stage - Étape de la tâche
   * @param {string} req.body.version - Version associée
   * @param {string} req.body.description - Description
   * @param {string} req.body.status - Statut
   * @param {number} [req.body.redmine] - ID Redmine (optionnel)
   * @returns {Promise<Object>} Objet Task créé
   */
  fastify.post(
    "/tasks",
    {
      schema: {
        description: "Crée une nouvelle tâche",
        tags: ["Task"],
        body: {
          type: "object",
          properties: {
            stage: { type: "string" },
            version: { type: "string" },
            description: { type: "string" },
            position: { type: "integer" },
            status: { type: "string" },
            redmine: { type: "integer", nullable: true },
          },
          required: ["stage", "version", "description", "status"],
        },
        response: { 200: taskSchema },
      },
    },
    async (req) => {
      return prisma.task.create({ data: req.body });
    }
  );

  /**
   * PATCH /tasks/:id
   *
   * Met à jour les informations d'une tâche existante.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la tâche
   * @param {Object} req.body - Données à mettre à jour
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Objet Task mis à jour ou erreur
   */
  fastify.patch(
    "/tasks/:id",
    {
      schema: {
        description: "Met à jour une tâche existante",
        tags: ["Task"],
        params: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            stage: { type: "string" },
            version: { type: "string" },
            description: { type: "string" },
            position: { type: "integer" },
            status: { type: "string" },
            redmine: { type: "integer", nullable: true },
          },
        },
        response: {
          200: taskSchema,
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id);
      try {
        return await prisma.task.update({
          where: { id },
          data: req.body,
        });
      } catch {
        reply.code(404);
        return { error: "Tâche non trouvée" };
      }
    }
  );

  /**
   * DELETE /tasks/:id
   *
   * Supprime une tâche par son ID.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la tâche
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<{message: string}|{error: string}>} Message de succès ou erreur
   */
  fastify.delete(
    "/tasks/:id",
    {
      schema: {
        description: "Supprime une tâche par son ID",
        tags: ["Task"],
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
        await prisma.task.delete({ where: { id } });
        return { message: "Tâche supprimée" };
      } catch {
        reply.code(404);
        return { error: "Tâche non trouvée" };
      }
    }
  );

  /**
   * PATCH /tasks/batch
   *
   * Met à jour plusieurs tâches en une seule requête.
   *
   * @param {Object} req - Requête Fastify
   * @param {Array<Object>} req.body - Tableau des tâches à mettre à jour
   * @param {number} req.body[].id - ID de la tâche (requis)
   * @param {string} [req.body[].stage] - Nouvelle colonne de la tâche
   * @param {string} [req.body[].version] - Version
   * @param {string} [req.body[].description] - Description
   * @param {string} [req.body[].title] - Titre
   * @param {number} [req.body[].position] - Position dans la colonne
   * @param {string} [req.body[].status] - Statut
   * @param {number|null} [req.body[].redmine] - ID Redmine optionnel
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Array<Object>|{error: string}>} Tableau des tâches mises à jour ou message d'erreur
   */
  fastify.patch(
    "/tasks/batch",
    {
      schema: {
        description: "Met à jour plusieurs tâches en une seule requête",
        tags: ["Task"],
        body: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              stage: { type: "string" },
              version: { type: "string" },
              description: { type: "string" },
              position: { type: "integer" },
              status: { type: "string" },
              redmine: { type: "integer", nullable: true },
            },
            required: ["id"],
          },
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                stage: { type: "string" },
                version: { type: "string" },
                description: { type: "string" },
                position: { type: "integer" },
                status: { type: "string" },
                redmine: { type: "integer", nullable: true },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const tasks = req.body as Array<Partial<PrismaTask> & { id: number }>;

      if (!tasks.length) {
        return reply.status(400).send({ error: "Le tableau de tâches est vide" });
      }

      try {
        // On fait un update pour chaque tâche, dans une transaction
        const updatedTasks = await prisma.$transaction(
          tasks.map(t =>
            prisma.task.update({
              where: { id: t.id },
              data: t,
            })
          )
        );

        return updatedTasks;
      } catch (error) {
        console.error(error);
        return reply.status(500).send({ error: "Impossible de mettre à jour les tâches" });
      }
    }
  );
}
