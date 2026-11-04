/*
  Tableaux multiples, migration générée puis éditée à la main.

  - Une base qui a déjà des données reçoit un tableau « Mon tableau » d'id 1,
    que la seed 00_initial_board traduit ensuite dans la langue de l'interface.
    Une base neuve n'en reçoit aucun, la seed le crée.
  - Toutes les colonnes rejoignent ce tableau (boardId obligatoire), ainsi que
    toutes les tâches et séries, archivées comprises, s'il existe.
*/
-- CreateTable
CREATE TABLE "Board" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "color" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tableau par défaut d'une base qui a déjà des données, et seulement d'elle
INSERT INTO "Board" ("id", "name", "nameKey", "position")
SELECT 1, 'Mon tableau', 'mon tableau', 0
WHERE EXISTS (SELECT 1 FROM "Stage") OR EXISTS (SELECT 1 FROM "Task") OR EXISTS (SELECT 1 FROM "Recurrence");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Recurrence" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "frequency" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "weekdays" TEXT,
    "monthlyMode" TEXT,
    "time" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endType" TEXT NOT NULL DEFAULT 'never',
    "endsOn" DATETIME,
    "maxCount" INTEGER,
    "generatedCount" INTEGER NOT NULL DEFAULT 1,
    "skipIfPending" BOOLEAN NOT NULL DEFAULT true,
    "anchor" TEXT NOT NULL DEFAULT 'schedule',
    "leadDays" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "nextRunAt" DATETIME,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "stageId" INTEGER,
    "checklistItems" JSONB NOT NULL DEFAULT [],
    "boardId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recurrence_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Recurrence_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Recurrence" ("boardId", "anchor", "checklistItems", "createdAt", "description", "endType", "endsOn", "frequency", "generatedCount", "id", "interval", "leadDays", "maxCount", "monthlyMode", "nextRunAt", "skipIfPending", "stageId", "startsAt", "status", "time", "title", "updatedAt", "version", "weekdays") SELECT CASE WHEN EXISTS (SELECT 1 FROM "Board") THEN 1 END, "anchor", "checklistItems", "createdAt", "description", "endType", "endsOn", "frequency", "generatedCount", "id", "interval", "leadDays", "maxCount", "monthlyMode", "nextRunAt", "skipIfPending", "stageId", "startsAt", "status", "time", "title", "updatedAt", "version", "weekdays" FROM "Recurrence";
DROP TABLE "Recurrence";
ALTER TABLE "new_Recurrence" RENAME TO "Recurrence";
CREATE INDEX "Recurrence_status_nextRunAt_idx" ON "Recurrence"("status", "nextRunAt");
CREATE TABLE "new_Stage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "color" TEXT,
    "boardId" INTEGER NOT NULL,
    CONSTRAINT "Stage_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Stage" ("boardId", "color", "id", "name", "position") SELECT 1, "color", "id", "name", "position" FROM "Stage";
DROP TABLE "Stage";
ALTER TABLE "new_Stage" RENAME TO "Stage";
CREATE INDEX "Stage_boardId_idx" ON "Stage"("boardId");
CREATE TABLE "new_Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "version" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "isHistorized" BOOLEAN NOT NULL DEFAULT false,
    "historizationDate" DATETIME,
    "stageId" INTEGER,
    "startDate" DATETIME,
    "notifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "recurrenceId" INTEGER,
    "occurrenceDate" DATETIME,
    "boardId" INTEGER,
    CONSTRAINT "Task_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "Recurrence" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("boardId", "createdAt", "description", "historizationDate", "id", "isHistorized", "notifiedAt", "occurrenceDate", "position", "recurrenceId", "stageId", "startDate", "title", "updatedAt", "version") SELECT CASE WHEN EXISTS (SELECT 1 FROM "Board") THEN 1 END, "createdAt", "description", "historizationDate", "id", "isHistorized", "notifiedAt", "occurrenceDate", "position", "recurrenceId", "stageId", "startDate", "title", "updatedAt", "version" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_boardId_idx" ON "Task"("boardId");
CREATE UNIQUE INDEX "Task_recurrenceId_occurrenceDate_key" ON "Task"("recurrenceId", "occurrenceDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Board_name_key" ON "Board"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Board_nameKey_key" ON "Board"("nameKey");
