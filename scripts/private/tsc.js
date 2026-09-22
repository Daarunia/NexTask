import { exec } from 'node:child_process'
import path from 'node:path'
import pc from 'picocolors'
import { ROOT } from './paths.js'

const TSC_BIN = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc')

/**
 * Compile TypeScript in the given directory using tsc.
 * @param {string} directory - Path to the directory containing tsconfig.json
 * @returns {Promise<void>}
 */
export default function compile(directory) {
  return new Promise((resolve, reject) => {
    const tscProcess = exec(TSC_BIN, { cwd: directory })
    tscProcess.stdout.on('data', (data) => {
      process.stdout.write(pc.yellow('[tsc] ') + pc.white(data.toString()))
    })

    tscProcess.stderr.on('data', (data) => {
      process.stderr.write(pc.red('[tsc error] ') + pc.white(data.toString()))
    })

    tscProcess.on('exit', (exitCode) => {
      if (exitCode > 0) {
        reject(new Error(`tsc failed with exit code ${exitCode}`))
      } else {
        resolve()
      }
    })
  })
}
