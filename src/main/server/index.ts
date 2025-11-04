import Fastify from "fastify";
import taskRoutes from "./routes/tasks.routes.js";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import fastifyCors from "@fastify/cors";

export async function startServer() {
  const fastify = Fastify({ logger: true });

  // Enregistrer le plugin CORS
  fastify.register(fastifyCors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  });

  // ---- Swagger ----
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: "Todo List API",
        description: "API pour gérer les tâches",
        version: "1.0.0",
      },
    },
  });

  // ---- point d'accés Swagger ----
  await fastify.register(swaggerUI, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "full",
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // Routes des tâches
  await fastify.register(taskRoutes);

  try {
    await fastify.listen({ port: 3000 });
    console.log("Fastify API -> http://localhost:3000");
    console.log("Swagger UI -> http://localhost:3000/docs");
  } catch (err) {
    fastify.log.error(err);
    throw err;
  }
}
