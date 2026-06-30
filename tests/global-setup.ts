import pc from "picocolors";
import { compileMain } from "../scripts/server-utils.js";

// jcp --ignore-checks le fichier doit être ignoré par le pre-commit
export default async function globalSetup() {
  const start = Date.now();

  try {
    console.log(pc.blue("Compiling Electron main process...\n"));
    await compileMain();

    console.log(pc.green("\n======================================="));
    console.log(
      pc.green(`✔ Setup completed - Duration: ${Date.now() - start}ms`),
    );
    console.log(pc.green("=======================================\n"));
  } catch (err) {
    console.error("\n" + pc.red("Global setup failed\n"));
    console.error(err);
    process.exit(1);
  }
}
