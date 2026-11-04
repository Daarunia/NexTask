-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- nameKey rempli avec le nom en minuscules (lower() de SQLite ne traite que l'ASCII)
INSERT INTO "new_Tag" ("color", "createdAt", "id", "name", "nameKey") SELECT "color", "createdAt", "id", "name", lower("name") FROM "Tag";
DROP TABLE "Tag";
ALTER TABLE "new_Tag" RENAME TO "Tag";
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");
CREATE UNIQUE INDEX "Tag_nameKey_key" ON "Tag"("nameKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

