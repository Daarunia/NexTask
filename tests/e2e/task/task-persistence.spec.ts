import { test, expect } from "../../fixtures/test";

/**
 * Vérifie que les données sont réellement persistées côté serveur/DB, et pas
 * seulement mises à jour de façon optimiste dans l'UI : on recharge la page et
 * la tâche doit toujours être là (l'app re-fetch depuis le serveur au montage).
 */

test("une tâche créée persiste après rechargement", async ({
  taskBoard,
  page,
}) => {
  const title = `Persist ${Date.now().toString().slice(-6)}`;

  await taskBoard.createTask("A faire", { title });
  await expect(taskBoard.taskCard(title)).toBeVisible();

  await page.reload();

  await expect(taskBoard.taskCard(title)).toBeVisible();

  await taskBoard.archiveTask(title);
});
