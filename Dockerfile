# Serveur autonome de NexTask : l'API de src/core, sans Electron (cf. src/server).
#
#   docker build -t nextask-server .
#   docker run -d -p 3000:3000 -v nextask-data:/data -e NEXTASK_TOKEN=<32 caractères au moins> nextask-server
#
# Variables : NEXTASK_TOKEN (requis), NEXTASK_LOCALE, NEXTASK_CORS_ORIGINS, PORT, HOST (cf. src/server/env.ts).

# ---- Outils de compilation de better-sqlite3 ----
# Faute de binaire précompilé pour cette version de Node, le module se compile :
# ces outils ne servent qu'aux étapes d'installation, pas à l'image finale
FROM node:24-bookworm-slim AS toolchain
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# ---- Dépendances d'exécution seules ----
# Sans les dépendances optionnelles : @prisma/client déclare le CLI Prisma et
# TypeScript en peer optionnels, inutiles au client généré, que --omit=dev seul
# garderait (plus de 300 Mo). Aucune dépendance de prod n'est optionnelle
# (cf. package-lock.json). Le script prepare (husky, dépendance de dev) est
# retiré avant l'installation
FROM toolchain AS deps
COPY package.json package-lock.json ./
RUN npm pkg delete scripts.prepare \
 && npm ci --omit=dev --omit=optional \
 && npm cache clean --force

# ---- Compilation : client Prisma, serveur et core ----
FROM toolchain AS build
# Ni binaire d'Electron (dépendance de dev, inutile au serveur) ni hooks Git
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    HUSKY=0
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma.config.ts ./
COPY src/core ./src/core
COPY src/server ./src/server
RUN npx prisma generate \
 && npx tsc -p src/server/tsconfig.json

# ---- Image d'exécution ----
FROM node:24-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production \
    NEXTASK_DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=deps /app/package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/src/core/prisma/migrations ./src/core/prisma/migrations
COPY --from=build /app/src/core/prisma/seeds ./src/core/prisma/seeds

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# node en PID 1 : main.ts gère SIGTERM (docker stop) pour fermer la base proprement
CMD ["node", "build/server/main.js"]
