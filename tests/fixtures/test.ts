import { test as base, expect, Page } from "@playwright/test";
import { _electron as electron, ElectronApplication } from "playwright";
import { Header } from "../components/Header";
import {
  compileMain,
  electronArgs,
  startRenderer,
} from "../../scripts/server-utils.js";

type Fixtures = {
  electronApp: ElectronApplication;
  page: Page;
  header: Header;
};

/**
 * Base du lancement d'un test
 */
export const test = base.extend<Fixtures>({
  electronApp: async ({}, use) => {
    await compileMain(); // Compilation du main
    const vite = await startRenderer(); // Lancement du serveur vite / front

    // Lancement electron
    const app = await electron.launch({
      args: electronArgs(vite.config.server.port, ["--test"]),
    });

    try {
      await use(app);
    } finally {
      await app.close();
      await vite.close();
    }
  },

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await use(page);
  },

  header: async ({ page }, use) => {
    await use(new Header(page));
  },
});

export { expect };
