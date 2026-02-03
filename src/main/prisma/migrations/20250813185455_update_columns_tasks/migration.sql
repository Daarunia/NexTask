/*
  Warnings:

  - You are about to drop the column `row` on the `task` table. All the data in the column will be lost.
  - You are about to alter the column `redmine` on the `task` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - Added the required column `stage` to the `Task` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `task` DROP COLUMN `row`,
    ADD COLUMN `stage` VARCHAR(191) NOT NULL,
    MODIFY `version` VARCHAR(191) NOT NULL,
    MODIFY `status` VARCHAR(191) NOT NULL,
    MODIFY `redmine` INTEGER NULL;
