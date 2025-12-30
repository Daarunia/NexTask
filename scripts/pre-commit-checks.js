/**
 * CODE VERIFICATION FILE. Checks for the presence of TODO, FIXME, or console.log()
 * jcp --ignore-checks
 */
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { execSync } from "node:child_process";

// Function to get staged files using git diff
const getStagedFiles = () => {
  const result = execSync("git diff --name-only --cached", {
    encoding: "utf-8",
  });
  return result.split("\n").filter(Boolean);
};

// Function to check for TODO, FIXME, or console.log in a file
const checkForKeywords = (filePath) => {
  const fileContent = fs.readFileSync(filePath, "utf-8");

  // Si le fichier contient "jcp --ignore-checks", on ignore la vérification
  if (fileContent.includes("jcp --ignore-checks")) {
    console.log(
      chalk.yellow(
        `Skipping checks for ${filePath} due to jcp --ignore-checks`,
      ),
    );
    return false;
  }

  const keywords = ["TODO", "FIXME", "console.log"];

  // Check if the file contains any of the keywords
  for (const keyword of keywords) {
    if (fileContent.includes(keyword)) {
      console.log(chalk.red(`Found "${keyword}" in ${filePath}`));
      return true;
    }
  }

  return false;
};

let hasError = false;

// Get the list of staged files
const files = getStagedFiles();

// Check each staged file
files.forEach((file) => {
  const filePath = path.resolve(file);

  // Exclude files like package.json and those in ./scripts
  if (filePath.includes("package.json") || filePath.includes("scripts")) {
    return;
  }

  if (checkForKeywords(filePath)) {
    hasError = true;
  }
});

// If any errors are found, prevent commit
if (hasError) {
  console.log(chalk.red("Commit aborted due to TODO/FIXME/console.log found."));
  process.exit(1);
} else {
  console.log(
    chalk.green("No TODO/FIXME/console.log found. Proceeding with commit."),
  );
  process.exit(0);
}
