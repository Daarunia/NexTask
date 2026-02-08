import path from "node:path";
import pc from "picocolors";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import compile from "./private/tsc.js";

// jcp --ignore-checks le fichier doit être ignoré par le pre-commit
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildRenderer() {
  return build({
    configFile: path.join(__dirname, "..", "vite.config.mjs"),
    base: "./",
    mode: "production",
  });
}

// Suppression du dossier build
fs.rmSync(path.join(__dirname, "..", "build"), {
  recursive: true,
  force: true,
});

console.log(pc.blue("Transpiling Prisma, renderer & main..."));

/**
 * Build
 */
async function buildAll() {
  try {
    // Compiler le main
    const mainPath = path.join(__dirname, "..", "src", "main");
    await compile(mainPath);

    // Compiler le renderer
    await buildRenderer();

    console.log(pc.green("Prisma, main & renderer successfully transpiled!"));
    console.log(pc.green("Build ready for electron-builder !"));
  } catch (err) {
    console.error(pc.red("Erreur lors du build complet : "), err);
    process.exit(1);
  }
}

buildAll();
