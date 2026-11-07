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
    "dueDate" DATETIME,
    "notifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- Backfill des lignes existantes : createdAt/updatedAt à l'horodatage courant
INSERT INTO "new_Task" ("description", "historizationDate", "id", "isHistorized", "position", "stageId", "title", "version", "createdAt", "updatedAt")
SELECT "description", "historizationDate", "id", "isHistorized", "position", "stageId", "title", "version", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
