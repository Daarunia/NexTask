-- CreateTable
CREATE TABLE "Recurrence" (
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

-- CreateTable
CREATE TABLE "_RecurrenceToTag" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_RecurrenceToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Recurrence" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_RecurrenceToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    CONSTRAINT "Task_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "Recurrence" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("createdAt", "description", "historizationDate", "id", "isHistorized", "notifiedAt", "position", "stageId", "startDate", "title", "updatedAt", "version") SELECT "createdAt", "description", "historizationDate", "id", "isHistorized", "notifiedAt", "position", "stageId", "startDate", "title", "updatedAt", "version" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE UNIQUE INDEX "Task_recurrenceId_occurrenceDate_key" ON "Task"("recurrenceId", "occurrenceDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Recurrence_status_nextRunAt_idx" ON "Recurrence"("status", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "_RecurrenceToTag_AB_unique" ON "_RecurrenceToTag"("A", "B");

-- CreateIndex
CREATE INDEX "_RecurrenceToTag_B_index" ON "_RecurrenceToTag"("B");

