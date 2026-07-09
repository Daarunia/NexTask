import { test as base, expect, Page } from "@playwright/test";
import { _electron as electron, ElectronApplication } from "playwright";
import { Header } from "../components/Header";
import { TaskBoard } from "../components/TaskBoard";
import { startRenderer, electronArgs } from "../../scripts/server-utils.js";

type Fixtures = {
  electronApp: ElectronApplication;
  page: Page;
  header: Header;
  taskBoard: TaskBoard;
};

type WorkerFixtures = {
  vitePort: number;
};

/**
 * Base du lancement d'un test
 */
export const test = base.extend<Fixtures, WorkerFixtures>({
  vitePort: [
    async ({}, use) => {
      const vite = await startRenderer();

      try {
        await use(vite.config.server.port);
      } finally {
        await vite.close();
      }
    },
    { scope: "worker" },
  ],

  electronApp: [
    async ({ vitePort }, use) => {
      const app = await electron.launch({
        args: electronArgs(vitePort, ["--test"]),
      });

      try {
        await use(app);
      } finally {
        await app.close();
      }
    },
    { scope: "worker", auto: true } as any,
  ],

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await use(page);
  },

  header: async ({ page }, use) => {
    await use(new Header(page));
  },

  taskBoard: async ({ page }, use) => {
    await use(new TaskBoard(page));
  },
});

export { expect };
