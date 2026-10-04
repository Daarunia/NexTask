import path from 'node:path'
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter'

// jcp --ignore-checks le fichier doit être ignoré par le pre-commit
/**
 * Reporter local : une ligne par test réussi, puis le récapitulatif des tests
 * en échec ou instables (passés au second essai) avec leurs erreurs.
 *
 * Le reporter « list » écrit aussi une ligne au démarrage de chaque test. Il la
 * remplace normalement par le résultat, sauf dans un terminal qui ne donne pas sa
 * hauteur : les deux lignes restent alors, mêlées entre les workers.
 */

const useColors = !!process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code: number) => (text: string) => (useColors ? `\u001B[${code}m${text}\u001B[0m` : text)
const green = paint(32)
const red = paint(31)
const yellow = paint(33)
const dim = paint(2)

/** Durée lisible : 850ms, 2.3s, 1.5m. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/** Projet, fichier, ligne et titre complet du test. */
function testTitle(test: TestCase): string {
  const [, project, , ...titles] = test.titlePath()
  const file = path.relative(process.cwd(), test.location.file)
  return `[${project}] › ${file}:${test.location.line} › ${titles.join(' › ')}`
}

export default class PassedReporter implements Reporter {
  private suite!: Suite
  private passed = 0

  printsToStdio() {
    return true
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.suite = suite
    const workers = config.workers > 1 ? `${config.workers} workers` : '1 worker'
    console.log(`\nRunning ${suite.allTests().length} tests using ${workers}\n`)
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status !== 'passed') return
    this.passed++
    const retry = result.retry > 0 ? yellow(` (retry #${result.retry})`) : ''
    const index = dim(String(this.passed).padStart(4))
    console.log(`  ${green('✓')} ${index} ${testTitle(test)}${retry} ${dim(`(${formatDuration(result.duration)})`)}`)
  }

  onEnd(result: FullResult) {
    const tests = this.suite.allTests()
    const failed = tests.filter((t) => t.outcome() === 'unexpected')
    const flaky = tests.filter((t) => t.outcome() === 'flaky')
    const skipped = tests.filter((t) => t.outcome() === 'skipped')
    const expected = tests.filter((t) => t.outcome() === 'expected')

    // Détail des échecs : l'erreur de chaque essai raté, puis les fichiers utiles
    failed.forEach((test, i) => {
      console.log(`\n  ${red(`${i + 1}) ${testTitle(test)}`)}\n`)
      for (const attempt of test.results) {
        if (attempt.status === 'passed' || attempt.status === 'skipped') continue
        if (attempt.retry > 0) console.log(dim(`    Retry #${attempt.retry} ${'─'.repeat(40)}\n`))
        for (const error of attempt.errors) {
          console.log(indent(error.message ?? error.value ?? 'Erreur inconnue'))
          if (error.snippet) console.log(`\n${indent(error.snippet)}`)
          console.log('')
        }
        for (const attachment of attempt.attachments) {
          if (attachment.path)
            console.log(dim(`    ${attachment.name} : ${path.relative(process.cwd(), attachment.path)}`))
        }
      }
    })

    console.log('')
    if (failed.length) {
      console.log(red(`  ${failed.length} failed`))
      for (const test of failed) console.log(red(`    ${testTitle(test)}`))
    }
    if (flaky.length) {
      console.log(yellow(`  ${flaky.length} flaky`))
      for (const test of flaky) console.log(yellow(`    ${testTitle(test)}`))
    }
    if (skipped.length) console.log(yellow(`  ${skipped.length} skipped`))
    console.log(green(`  ${expected.length} passed`) + dim(` (${formatDuration(result.duration)})`))
    if (result.status === 'interrupted') console.log(yellow('  Lancement interrompu'))
  }
}

/**
 * Décale chaque ligne d'un bloc de texte sous le titre du test. Les erreurs
 * arrivent colorées : couleurs retirées hors terminal (sortie redirigée).
 */
function indent(text: string): string {
  const plain = useColors ? text : text.replace(/\u001B\[[0-9;]*m/g, '')
  return plain
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')
}
