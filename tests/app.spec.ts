import {
  test as baseTest,
  expect,
  Browser,
  Page,
  BrowserContext,
} from "@playwright/test";

let page: Page;
let context: BrowserContext;

baseTest.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();

  // Nav sur l'app
  await page.goto("http://localhost:8080");
  await expect(page.locator("#app")).toBeVisible();
});

baseTest.afterAll(async () => {
  await page.close();
  await context.close();
});

baseTest("app launches", async () => {
  await expect(page).toHaveTitle(/NexTask/);
});
