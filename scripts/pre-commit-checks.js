/**
 * CODE VERIFICATION FILE. Checks for the presence of TODO, FIXME, or console.log()
 * jcp --ignore-checks
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

// Function to get staged files using git diff
const getStagedFiles = () => {
  const result = execSync('git diff --cached --name-status', {
    encoding: 'utf-8',
  })

  return result
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, file] = line.split('\t')
      if (status === 'D') return null // ignore deleted files
      return file
    })
    .filter(Boolean)
}

// Function to check for TODO, FIXME, or console.log in a file
const checkForKeywords = (filePath) => {
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping missing file: ${filePath}`)
    return false
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8')

  // Si le fichier contient "jcp --ignore-checks", on ignore la vérification
  if (fileContent.includes('jcp --ignore-checks')) {
    console.log(`Skipping checks for ${filePath} due to jcp --ignore-checks`)
    return false
  }

  const keywords = ['TODO', 'FIXME', 'console.log']

  // Check if the file contains any of the keywords
  for (const keyword of keywords) {
    if (fileContent.includes(keyword)) {
      console.log(`Found "${keyword}" in ${filePath}`)
      return true
    }
  }

  return false
}

// src/core et le serveur autonome (src/server) doivent tourner sans Electron et
// sans le main : ni import d'un paquet electron*, ni import d'un module de
// src/main (cf. CLAUDE.md)
const CORE_FORBIDDEN_IMPORT =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\(\s*)['"](?:electron(?:-[\w-]+)?(?:\/[^'"]*)?|(?:\.\.?\/)+(?:\.\.\/)*main\/[^'"]*)['"]/g

const checkCoreImports = (file) => {
  const normalized = file.replaceAll('\\', '/')
  const isGuarded = normalized.startsWith('src/core/') || normalized.startsWith('src/server/')
  if (!isGuarded || !/\.(ts|js|mjs|cjs)$/.test(normalized)) return false
  if (!fs.existsSync(file)) return false

  const matches = fs.readFileSync(file, 'utf-8').match(CORE_FORBIDDEN_IMPORT)
  if (!matches) return false
  for (const match of matches) console.log(`Import interdit sans Electron (${file}) : ${match}`)
  return true
}

let hasError = false

// Get the list of staged files
const files = getStagedFiles()

// Check each staged file
files.forEach((file) => {
  if (checkCoreImports(file)) {
    hasError = true
  }

  const filePath = path.resolve(file)

  // Exclude files like package.json and those in ./scripts
  if (filePath.includes('package.json') || filePath.includes('scripts')) {
    return
  }

  if (checkForKeywords(filePath)) {
    hasError = true
  }
})

// If any errors are found, prevent commit
if (hasError) {
  console.log('Commit aborted due to TODO/FIXME/console.log or a forbidden import in src/core or src/server.')
  process.exit(1)
} else {
  console.log('No TODO/FIXME/console.log found. Proceeding with commit.')
  process.exit(0)
}
