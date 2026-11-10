# NexTask

Todo list Kanban de bureau, hors ligne : Electron + Vue 3 + Prisma/SQLite. Le main embarque un serveur
Fastify local que le renderer appelle en HTTP. La même API tourne aussi seule sous Node (`src/server`,
image Docker), sans Electron.

Deux éditions de l'app desktop, choisies à la compilation (`src/main/edition.ts`, `--edition=client` ou
`NEXTASK_EDITION=client`) : **NexTask** (API et base intégrées) et **NexTask Client**, branchée sur un
serveur par son adresse et son jeton, livrée sans l'API ni la base.

## Structure

```
src/
  core/                Serveur et données, sans Electron ni import du main (compilés avec le main)
    config.ts          initCore() : chemins, version, modes ; settings.ts, i18n.ts, logger.ts : fournisseurs
    server/            API Fastify locale
      routes/          Une route par domaine (task, stage, board, tag, recurrence, checklistTemplate, data, document)
                       settings.routes.ts : réglages « données » en base, branchés par le serveur autonome seul
                       reminder.routes.ts : rappels échus, réclamés par NexTask Client
                       test.routes.ts : remise à zéro de la base et pilotage, pour les tests E2E (chargé à la
                       demande, absent de l'image publiée du serveur)
      schemas/         Schémas JSON de validation des routes
      helpers/         Logique métier côté serveur
    prisma/            schema.prisma, migrations, seeds par langue (en, fr, es, pt, zh)
    database/          Fichier et verrou de la base SQLite, migrations et seeds au démarrage, dossier des documents,
                       réglages du serveur autonome (serverSettings.ts)
    scheduler/         Tâches de fond : récurrences, rappels échus, sauvegardes, purge des archives
    shared/            Constantes et helpers partagés avec le renderer (*.constants.ts, *.helper.ts) ;
                       settings.schema.ts : contraintes des réglages « données », pour electron-store et l'API ;
                       edition.constants.ts : éditions, leurs fonctions, état de la connexion à l'API ;
                       api.constants.ts : API_VERSION, à incrémenter à chaque changement incompatible de l'API
    locales/           Textes produits par le serveur (colonnes par défaut, motifs d'import), 5 langues
  main/                Processus principal Electron (Node)
    main.ts            Point d'entrée : charge le backend de l'édition, fenêtres, tray, IPC
    edition.ts         Édition compilée (réécrite dans build/main/edition.js par scripts/private/edition.js)
    backend/           Accès aux données de l'édition : backend.ts (interface, apiFetch) ;
                       local.ts : core, base et API intégrées (seul module du main à importer core hors catalogues) ;
                       remote.ts, connection.ts : serveur de NexTask Client, jeton chiffré par safeStorage
    database/          Emplacement de la base choisi par l'utilisateur (backend local seulement)
    scheduler/         Affichage des notifications de rappel
    system/            Intégration OS : quick add, mises à jour, import/export, état des fenêtres…
                       testBridge.ts : pont de test (notifications, dossiers, liens…), appelé par electronApp.evaluate()
    preload/           Pont exposé au renderer (dont la connexion à l'API : adresse, jeton, édition)
    locales/           Textes du main (notifications, menus, boîtes de dialogue), 5 langues
  server/              Serveur autonome sous Node, sans Electron : core sur un dossier de données
    main.ts            Point d'entrée : écoute, schedulers, arrêt sur SIGTERM
    app.ts             Branchement de core : config, réglages en base, langue par requête, jeton, mode test
    env.ts             Variables d'environnement (NEXTASK_TOKEN, NEXTASK_DATA_DIR, PORT, NEXTASK_TEST…)
  renderer/            Interface Vue 3 (PrimeVue, Tailwind v4, Pinia, vue-i18n)
    pages/             Home (tableau), Archives, Checklists, Settings, QuickAdd
    components/        Composants, dont kanban/, settings/, checklists/, server/ (connexion de NexTask Client)
    stores/            Stores Pinia par domaine
    utils/             Helpers purs (dates, recherche, récurrence, API via axios, état du serveur…)
    locales/           Textes de l'interface, 5 langues
tests/
  unit/                Vitest (*.spec.ts) : logique pure, main comme renderer ; core-boot.spec.ts démarre core sous Node,
                       server-boot.spec.ts le serveur autonome
  e2e/                 Playwright sur l'app Electron, par domaine (task, board, stage, tag…), en deux modes :
                       local (NexTask, API intégrée) et remote (NexTask Client, un conteneur du serveur par
                       worker). Tag @local : test propre à l'app locale (fichiers de l'hôte, emplacement de la
                       base, occurrences poussées par le main), sauté en remote ; tag @remote : l'inverse
  server/              Vitest sur l'image Docker du serveur, en boîte noire par HTTP (démarrage, jeton,
                       volume, arrêt sur SIGTERM, image de test) ; globalSetup.ts construit les images
  components/          Page objects Playwright (TaskBoard, Header, SettingsPage…)
  fixtures/test.ts     Lance une app par worker (et son conteneur en remote), remise à zéro avant chaque test
  helpers/             Helpers E2E (appels API directs, dialogues, overlays…) ; api.helper.ts : mode, adresse de
                       l'API et jeton ; desktop.helper.ts : pont de test, resetApp, setSetting ; remote.helper.ts
scripts/               Dev server, build, release, couverture E2E, contrôles de pre-commit, bundle du client
Dockerfile             Image du serveur autonome (données dans le volume /data) ; cible `test` : routes de test
                       et NEXTASK_TEST=1, pour les tests E2E de NexTask Client
electron-builder.client.json  Build de NexTask Client : sans core (hors catalogues), base, Prisma ni Fastify
docs/                  Site GitHub Pages (en + fr), publié à chaque tag v*.*.*
```

## Commandes

- `npm run dev` : app en développement (base `dev.db`) ; `NEXTASK_EDITION=client npm run dev` : NexTask Client
  (serveur lancé avec `NEXTASK_CORS_ORIGINS=http://localhost:8080`, origine du renderer servi par Vite)
- `npm run typecheck` : TypeScript du main, de core seul (borné à son dossier), du serveur et vue-tsc du renderer
- `npm run test:unit` : tests Vitest
- `npm run test:e2e` : tests Playwright (compile le main et le renderer avant)
- `npx playwright test tests/e2e/task/task-batch.spec.ts` : un seul fichier E2E
- `npm run test:e2e:remote` : les mêmes specs en NexTask Client, contre un conteneur du serveur par worker
  (Docker requis ; arguments de Playwright après `--`)
- `npm run build:server` puis `NEXTASK_TOKEN=… npm run start:server` : serveur autonome (base dans `./data`)
- `npm run test:server` : tests des images Docker du serveur (Docker requis, images reconstruites avec leur cache)
- `npm run build:client:win` puis `npm run check:client-bundle` : installeur de NexTask Client (`dist/client`),
  et contrôle que son app.asar n'embarque ni l'API ni la base
- `npm run sonar` : analyse SonarQube locale
- `npm run release <major|minor|patch>` : incrémente la version et propose le tag

## Conventions

- Commentaires et JSDoc en français ; messages de commit en anglais, au format Conventional Commits
  (`feat(board): …`, `fix(search): …`, `test: …`).
- Tout texte visible s'ajoute dans les 5 langues (`src/renderer/locales`, `src/main/locales` ou `src/core/locales`).
- Modifier le schéma de la base = une nouvelle migration Prisma dans `src/core/prisma/migrations`.
- Changer le contrat de l'API sans compatibilité (route retirée, corps ou réponse changés) = incrémenter
  `API_VERSION` : NexTask Client refuse un serveur d'une autre version.
- Le renderer et les tests importent `src/core` par l'alias `@core/…` (déclaré dans `vite.config.mjs`,
  `vitest.config.ts`, `src/renderer/tsconfig.json` et `tests/tsconfig.json`). Le main et `core` restent
  en chemins relatifs : ils sont compilés par `tsc` sans bundler, qui ne réécrit pas les alias.
- Le main ne touche aux données que par son backend (`backend()`, `apiFetch`) : un module qui importe core
  hors `core/shared`, `core/i18n`, `core/locales` et `core/logger` n'existe pas dans NexTask Client.
- Le hook de pre-commit refuse les marqueurs de travail en suspens et les logs de console
  (cf. `scripts/pre-commit-checks.js`), tout import d'un paquet `electron*` ou de `src/main` dans
  `src/core` ou `src/server`, et dans `src/main` tout import de core hors de ses catalogues ailleurs que
  dans le backend local (cf. `scripts/private/import-guard.js`), formate avec Prettier puis lance le
  typecheck. Les logs passent par `electron-log` (main), la façade `src/core/logger.ts` (core, branchée sur
  `src/server/logger.ts` par le serveur) ou `src/renderer/utils/logger.ts`.
- Un réglage lu par core passe par `ServerSettings` (`src/core/settings.ts`). Un réglage « données »
  nouveau s'ajoute à `DATA_SETTINGS_KEYS` et `DATA_SETTINGS_SCHEMA` : l'app le garde dans electron-store,
  le serveur autonome (et donc NexTask Client) en base.

## À chaque fonctionnalité ou correctif

1. **Tester ce qui est testable.**
   - Logique pure (helpers, calculs de dates, récurrences, recherche, import) : test unitaire dans
     `tests/unit`.
   - Comportement du serveur autonome que les tests unitaires ne voient pas (image, volume, signaux,
     variables d'environnement) : test dans `tests/server`, puis `npm run test:server`.
   - Comportement visible dans l'app : test E2E dans le dossier du domaine sous `tests/e2e`, en passant
     par les page objects de `tests/components` (en ajouter si besoin) plutôt que par des sélecteurs
     bruts dans le test. Le main se pilote par le pont de test (`desktop()`), un réglage par `setSetting()`.
     Un test qui ne vaut que pour l'app locale prend le tag `@local`.
   - Lancer les tests concernés, puis `npm run typecheck`. Un changement qui touche l'API, le main ou la
     connexion se vérifie aussi en NexTask Client : `npm run test:e2e:remote`.
2. **Vérifier SonarQube après le développement.** Le serveur tourne sur `http://localhost:9000` et le
   scanner lit `SONAR_TOKEN`. Lancer `npm run sonar`, attendre la fin du traitement, puis lire :
   - le quality gate : `curl -s -u "$SONAR_TOKEN:" "http://localhost:9000/api/qualitygates/project_status?projectKey=nextask"`
   - les issues ouvertes : `curl -s -u "$SONAR_TOKEN:" "http://localhost:9000/api/issues/search?componentKeys=nextask&resolved=false"`

   Corriger les nouvelles issues. Un faux positif avéré s'ignore dans `sonar-project.properties`,
   avec un commentaire qui explique pourquoi, comme pour les règles déjà ignorées.
