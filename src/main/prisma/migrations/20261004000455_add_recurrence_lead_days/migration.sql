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
    "leadDays" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "nextRunAt" DATETIME,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "stageId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recurrence_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Recurrence" ("createdAt", "description", "endType", "endsOn", "frequency", "generatedCount", "id", "interval", "maxCount", "monthlyMode", "nextRunAt", "skipIfPending", "stageId", "startsAt", "status", "time", "title", "updatedAt", "version", "weekdays") SELECT "createdAt", "description", "endType", "endsOn", "frequency", "generatedCount", "id", "interval", "maxCount", "monthlyMode", "nextRunAt", "skipIfPending", "stageId", "startsAt", "status", "time", "title", "updatedAt", "version", "weekdays" FROM "Recurrence";
DROP TABLE "Recurrence";
ALTER TABLE "new_Recurrence" RENAME TO "Recurrence";
CREATE INDEX "Recurrence_status_nextRunAt_idx" ON "Recurrence"("status", "nextRunAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

