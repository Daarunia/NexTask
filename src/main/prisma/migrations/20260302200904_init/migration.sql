-- CreateTable
CREATE TABLE "Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "version" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "redmine" INTEGER,
    "title" TEXT NOT NULL,
    "isHistorized" BOOLEAN NOT NULL DEFAULT false,
    "historizationDate" DATETIME,
    "stageId" INTEGER NOT NULL,
    CONSTRAINT "Task_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL
);
