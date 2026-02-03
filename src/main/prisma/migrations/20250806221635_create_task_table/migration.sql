-- CreateTable
CREATE TABLE `Task` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `row` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `status` INTEGER NOT NULL,
    `redmine` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
