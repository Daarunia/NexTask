-- AlterTable
ALTER TABLE `task` ADD COLUMN `historizationDate` DATETIME(3) NULL,
    ADD COLUMN `isHistorized` BOOLEAN NOT NULL DEFAULT false;
