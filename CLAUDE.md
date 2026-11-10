# NexTask

Todo list Kanban de bureau, hors ligne : Electron + Vue 3 + Prisma/SQLite. Le main embarque un serveur
Fastify local que le renderer appelle en HTTP.

## Structure

```
src/
  core/                Serveur et données, sans Electron ni import du main (compilés avec le main)
    config.ts          initCore() : chemins, version, modes ; settings.ts, i18n.ts, logger.ts : fournisseurs
    server/            API Fastify locale
      routes/          Une route par domaine (task, stage, board, tag, recurrence, checklistTemplate, data, document)
                       test.routes.ts : remise à zéro de la base et pilotage, pour les tests E2E
      schemas/         Schémas JSON de validation des routes
      helpers/         Logique métier côté serveur
    prisma/            schema.prisma, migrations, seeds par langue (en, fr, es, pt, zh)
    database/          Fichier et verrou de la base SQLite, migrations et seeds au démarrage, dossier des documents
    scheduler/         Tâches de fond : récurrences, rappels échus, sauvegardes, purge des archives
    shared/            Constantes et helpers partagés avec le renderer (*.constants.ts, *.helper.ts)
    locales/           Textes produits par le serveur (colonnes par défaut, motifs d'import), 5 langues
  main/                Processus principal Electron (Node)
    main.ts            Point d'entrée : branche core (initCore, fournisseurs), serveur, fenêtres, tray
    database/          Emplacement de la base choisi par l'utilisateur
    scheduler/         Affichage des notifications de rappel
    system/            Intégration OS : quick add, mises à jour, import/export, état des fenêtres…
                       test.routes.ts : routes de test propres au desktop
    preload/           Pont exposé au renderer (dont l'URL du serveur)
    locales/           Textes du main (notifications, menus, boîtes de dialogue), 5 langues
  renderer/            Interface Vue 3 (PrimeVue, Tailwind v4, Pinia, vue-i18n)
    pages/             Home (tableau), Archives, Checklists, Settings, QuickAdd
    components/        Composants, dont kanban/, settings/, checklists/
    stores/            Stores Pinia par domaine
    utils/             Helpers purs (dates, recherche, récurrence, API via axios…)
    locales/           Textes de l'interface, 5 langues
tests/
  unit/                Vitest (*.spec.ts) : logique pure, main comme renderer ; core-boot.spec.ts démarre core sous Node
  e2e/                 Playwright sur l'app Electron, par domaine (task, board, stage, tag…)
  components/          Page objects Playwright (TaskBoard, Header, SettingsPage…)
  fixtures/test.ts     Lance une app par worker, base remise à zéro avant chaque test
  helpers/             Helpers E2E (appels API directs, dialogues, overlays…)
scripts/               Dev server, build, release, couverture E2E, contrôles de pre-commit
docs/                  Site GitHub Pages (en + fr), publié à chaque tag v*.*.*
```

## Commandes

- `npm run dev` : app en développement (base `dev.db`)
- `npm run typecheck` : TypeScript du main, de core seul (borné à son dossier) et vue-tsc du renderer
- `npm run test:unit` : tests Vitest
- `npm run test:e2e` : tests Playwright (compile le main et le renderer avant)
- `npx playwright test tests/e2e/task/task-batch.spec.ts` : un seul fichier E2E
- `npm run sonar` : analyse SonarQube locale
- `npm run release <major|minor|patch>` : incrémente la version et propose le tag

## Conventions

- Commentaires et JSDoc en français ; messages de commit en anglais, au format Conventional Commits
  (`feat(board): …`, `fix(search): …`, `test: …`).
- Tout texte visible s'ajoute dans les 5 langues (`src/renderer/locales`, `src/main/locales` ou `src/core/locales`).
- Modifier le schéma de la base = une nouvelle migration Prisma dans `src/core/prisma/migrations`.
- Le renderer et les tests importent `src/core` par l'alias `@core/…` (déclaré dans `vite.config.mjs`,
  `vitest.config.ts`, `src/renderer/tsconfig.json` et `tests/tsconfig.json`). Le main et `core` restent
  en chemins relatifs : ils sont compilés par `tsc` sans bundler, qui ne réécrit pas les alias.
- Le hook de pre-commit refuse les marqueurs de travail en suspens et les logs de console
  (cf. `scripts/pre-commit-checks.js`), ainsi que tout import d'un paquet `electron*` ou de `src/main`
  dans `src/core`, formate avec Prettier puis lance le typecheck. Les logs passent par `electron-log`
  (main), la façade `src/core/logger.ts` (core) ou `src/renderer/utils/logger.ts`.

## À chaque fonctionnalité ou correctif

1. **Tester ce qui est testable.**
   - Logique pure (helpers, calculs de dates, récurrences, recherche, import) : test unitaire dans
     `tests/unit`.
   - Comportement visible dans l'app : test E2E dans le dossier du domaine sous `tests/e2e`, en passant
     par les page objects de `tests/components` (en ajouter si besoin) plutôt que par des sélecteurs
     bruts dans le test.
   - Lancer les tests concernés, puis `npm run typecheck`.
2. **Vérifier SonarQube après le développement.** Le serveur tourne sur `http://localhost:9000` et le
   scanner lit `SONAR_TOKEN`. Lancer `npm run sonar`, attendre la fin du traitement, puis lire :
   - le quality gate : `curl -s -u "$SONAR_TOKEN:" "http://localhost:9000/api/qualitygates/project_status?projectKey=nextask"`
   - les issues ouvertes : `curl -s -u "$SONAR_TOKEN:" "http://localhost:9000/api/issues/search?componentKeys=nextask&resolved=false"`

   Corriger les nouvelles issues. Un faux positif avéré s'ignore dans `sonar-project.properties`,
   avec un commentaire qui explique pourquoi, comme pour les règles déjà ignorées.
