process.env.NODE_ENV = "development";

import { createServer } from "vite";
import { spawn } from "node:child_process";
import path from "node:path";
import pc from "picocolors";
import chokidar from "chokidar";
import electron from "electron";
import compile from "./private/tsc.js";
import fs from "node:fs";
import { EOL } from "node:os";
import { fileURLToPath } from "node:url";

// jcp --ignore-checks le fichier doit être ignoré par le pre-commit
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let viteServer = null;
let electronProcess = null;
let electronProcessLocker = false;
let rendererPort = 0;

async function startRenderer() {
  viteServer = await createServer({
    configFile: path.join(__dirname, "..", "vite.config.mjs"),
    mode: "development",
  });
  return viteServer.listen();
}

async function startElectron() {
  if (electronProcess) {
    return; // single instance lock
  }

  try {
    await compile(path.join(__dirname, "..", "src", "main"));
  } catch {
    console.log(
      pc.red(
        "Could not start Electron because of the above TypeScript error(s).",
      ),
    );
    electronProcessLocker = false;
    return;
  }

  const args = [
    path.join(__dirname, "..", "build", "main", "main.js"),
    rendererPort,
  ];
  electronProcess = spawn(electron, args);
  electronProcessLocker = false;

  electronProcess.stdout.on("data", (data) => {
    if (data == EOL) return;
    process.stdout.write(pc.blue("[electron] ") + pc.white(data.toString()));
  });

  electronProcess.stderr.on("data", (data) =>
    process.stderr.write(pc.blue("[electron] ") + pc.white(data.toString())),
  );

  electronProcess.on("exit", () => stop());
}

function restartElectron() {
  if (electronProcess) {
    electronProcess.removeAllListeners("exit");
    electronProcess.kill();
    electronProcess = null;
  }

  if (!electronProcessLocker) {
    electronProcessLocker = true;
    startElectron();
  }
}

function copyStaticFiles() {
  copy("static");
}

/**
 * The working dir of Electron is build/main instead of src/main because of TS.
 * tsc does not copy static files, so copy them over manually for dev server.
 */
function copy(relativePath) {
  fs.cpSync(
    path.join(__dirname, "..", "src", "main", relativePath),
    path.join(__dirname, "..", "build", "main", relativePath),
    { recursive: true },
  );
}

function stop() {
  viteServer.close();
  process.exit();
}

console.log(pc.green("======================================="));
console.log(pc.green("  Starting Electron + Vite Dev Server  "));
console.log(pc.green("======================================="));

const devServer = await startRenderer();
rendererPort = devServer.config.server.port;

copyStaticFiles();
await startElectron();

const mainPath = path.join(__dirname, "..", "src", "main");
chokidar.watch(mainPath, { cwd: mainPath }).on("change", (changedPath) => {
  console.log(
    pc.blue("[electron] ") + `Change in ${changedPath}. reloading... 🚀`,
  );

  if (changedPath.startsWith(path.join("static", "/"))) {
    copy(changedPath);
  }

  restartElectron();
});
