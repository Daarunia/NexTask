import { test, expect } from "../../fixtures/test";

/**
 * Tests E2E de l'écran de tâche (TaskDialog), feature principale de l'app :
 * création, valeurs par défaut, annulation, édition et archivage d'une tâche
 * depuis le tableau Kanban.
 *
 * Remarque : les specs partagent la même instance Electron et la même base
 * SQLite (pas de reset entre les runs). On génère donc des titres uniques pour
 * éviter toute collision avec des tâches créées lors d'un run précédent, et on
 * archive les tâches créées pour laisser le tableau propre.
 */

// Colonne seedée par défaut (voir prisma/seeds/01_initial_stages.sql)
const COLUMN = "A faire";

// Titre unique par test pour l'isolation malgré la base partagée
const uniqueTitle = (label: string) => `${label} ${Date.now()}`;

test("ouvre l'écran de tâche en création avec les valeurs par défaut", async ({
  taskBoard,
}) => {
  await taskBoard.openCreateDialog(COLUMN);

  // Champs vides et version par défaut à 1.5.0
  await expect(taskBoard.titleInput).toHaveValue("");
  await expect(taskBoard.descriptionInput).toHaveValue("");
  await expect(taskBoard.versionSelect).toContainText("1.5.0");

  await taskBoard.cancelButton.click();
  await expect(taskBoard.dialog).toBeHidden();
});

test("crée une nouvelle tâche qui apparaît dans la colonne", async ({
  taskBoard,
}) => {
  const title = uniqueTitle("Tâche créée");

  await taskBoard.createTask(COLUMN, {
    title,
    description: "Description de test",
    version: "1.4.5",
  });

  // La carte apparaît bien dans la colonne ciblée
  const card = taskBoard
    .column(COLUMN)
    .getByTestId("task-card")
    .filter({ has: taskBoard.page.getByText(title, { exact: true }) });
  await expect(card).toBeVisible();

  // Nettoyage
  await taskBoard.archiveTask(title);
});

test("annuler la création ne crée aucune tâche", async ({ taskBoard }) => {
  const title = uniqueTitle("Tâche annulée");

  await taskBoard.openCreateDialog(COLUMN);
  await taskBoard.titleInput.fill(title);
  await taskBoard.cancelButton.click();

  await expect(taskBoard.dialog).toBeHidden();
  await expect(taskBoard.taskCard(title)).toHaveCount(0);
});

test("pré-remplit l'écran puis reflète l'édition d'une tâche", async ({
  taskBoard,
}) => {
  const title = uniqueTitle("Tâche à éditer");
  const editedTitle = `${title} (modifiée)`;

  await taskBoard.createTask(COLUMN, { title, description: "Avant" });

  await taskBoard.openEditDialog(title);

  // Les champs sont pré-remplis avec la tâche existante
  await expect(taskBoard.titleInput).toHaveValue(title);
  await expect(taskBoard.descriptionInput).toHaveValue("Avant");

  await taskBoard.fillAndSave({ title: editedTitle, description: "Après" });

  // Nouveau titre visible, ancien titre disparu
  await expect(taskBoard.taskCard(editedTitle)).toBeVisible();
  await expect(taskBoard.taskCard(title)).toHaveCount(0);

  // Nettoyage
  await taskBoard.archiveTask(editedTitle);
});

test("archive une tâche la retire du tableau", async ({ taskBoard }) => {
  const title = uniqueTitle("Tâche à archiver");

  await taskBoard.createTask(COLUMN, { title });
  await expect(taskBoard.taskCard(title)).toBeVisible();

  await taskBoard.archiveTask(title);
  await expect(taskBoard.taskCard(title)).toHaveCount(0);
});
