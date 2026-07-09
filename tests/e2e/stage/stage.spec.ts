import { test, expect } from "../../fixtures/test";

/**
 * Tests E2E de la suppression de colonne (Stage).
 *
 * La suppression se fait via le menu contextuel (⋮ → "Supprimer") et, côté
 * store, archive au passage toutes les tâches non historisées de la colonne.
 *
 * Contrainte : la base est partagée entre runs et les colonnes seedées
 * ("A faire", "En cours"…) servent aux autres specs. Chaque test crée donc sa
 * propre colonne (nom unique) puis la supprime — on ne touche jamais au seed.
 */

const uid = () => Date.now().toString().slice(-6);

test("le menu d'une colonne propose l'action Supprimer", async ({
  taskBoard,
}) => {
  const stage = `Menu ${uid()}`;

  await taskBoard.addStage(stage);
  await taskBoard.openStageMenu(stage);

  await expect(
    taskBoard.page.getByRole("menuitem", { name: "Supprimer" }),
  ).toBeVisible();

  // Nettoyage
  await taskBoard.page.getByRole("menuitem", { name: "Supprimer" }).click();
  await expect(taskBoard.column(stage)).toHaveCount(0);
});

test("supprime une colonne vide", async ({ taskBoard }) => {
  const stage = `Vide ${uid()}`;

  await taskBoard.addStage(stage);
  await expect(taskBoard.column(stage)).toHaveCount(1);

  await taskBoard.deleteStage(stage);

  await expect(taskBoard.column(stage)).toHaveCount(0);
});

test("supprime une colonne et archive ses tâches", async ({ taskBoard }) => {
  const stage = `Pleine ${uid()}`;
  const task = `Tâche ${uid()}`;

  await taskBoard.addStage(stage);
  await taskBoard.createTask(stage, { title: task });
  await expect(taskBoard.taskCard(task)).toBeVisible();

  await taskBoard.deleteStage(stage);

  // La colonne disparaît…
  await expect(taskBoard.column(stage)).toHaveCount(0);
  // … et sa tâche n'est plus affichée (archivée, retirée du tableau)
  await expect(taskBoard.taskCard(task)).toHaveCount(0);
});
