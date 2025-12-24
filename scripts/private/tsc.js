import { exec } from "node:child_process";
import pc from "picocolors";

/**
 * Compile TypeScript in the given directory using tsc.
 * @param {string} directory - Path to the directory containing tsconfig.json
 * @returns {Promise<void>}
 */
export default function compile(directory) {
  return new Promise((resolve, reject) => {
    const tscPath = path.join("C:", "nvm4w", "nodejs", "tsc");
    const tscProcess = exec(tscPath, { cwd: directory });

    tscProcess.stdout.on("data", (data) => {
      process.stdout.write(pc.yellow("[tsc] ") + pc.white(data.toString()));
    });

    tscProcess.stderr.on("data", (data) => {
      process.stderr.write(pc.red("[tsc error] ") + pc.white(data.toString()));
    });

    tscProcess.on("exit", (exitCode) => {
      if (exitCode > 0) {
        reject(new Error(`tsc failed with exit code ${exitCode}`));
      } else {
        resolve();
      }
    });
  });
}
