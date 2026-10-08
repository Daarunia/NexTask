import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { fr } from '../../src/renderer/locales/fr'
import { en } from '../../src/renderer/locales/en'
import { fr as mainFr } from '../../src/main/locales/fr'
import { en as mainEn } from '../../src/main/locales/en'

/**
 * Garde-fous de la traduction de l'interface : aucun texte en dur dans les
 * templates Vue (tout passe par les catalogues), et des catalogues complets
 * dans chaque langue.
 */

const RENDERER = path.join(__dirname, '../../src/renderer')

// Textes autorisés en dur : marque de l'app, coupée pour colorer « Nex »
const ALLOWED_TEXTS = new Set(['Nex', 'Task'])

// Attributs affichés à l'utilisateur, à lier à une traduction (`:label="t(…)"`)
const VISIBLE_ATTRIBUTES = [
  'label',
  'title',
  'placeholder',
  'aria-label',
  'ariaLabel',
  'description',
  'emptyMessage',
  'header',
]

/**
 * Fichiers .vue du renderer, récursivement.
 * @param dir Dossier parcouru
 */
function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return vueFiles(full)
    return entry.name.endsWith('.vue') ? [full] : []
  })
}

/**
 * Template d'un composant, sans les commentaires HTML ni les interpolations.
 * @param source Contenu du fichier .vue
 */
function templateOf(source: string): string {
  const start = source.indexOf('<template>')
  const end = source.lastIndexOf('</template>')
  if (start === -1 || end === -1) return ''
  return source
    .slice(start, end)
    .replaceAll(/<!--[\s\S]*?-->/g, '')
    .replaceAll(/\{\{[\s\S]*?\}\}/g, '')
}

/**
 * Textes en dur d'un template : texte entre deux balises, ou attribut affiché
 * avec une valeur fixe.
 * @param template Template nettoyé
 */
function hardcodedTexts(template: string): string[] {
  const texts = [...template.matchAll(/>([^<>]*)</g)]
    .map((match) => match[1].trim())
    .filter((text) => /\p{L}/u.test(text) && !ALLOWED_TEXTS.has(text))

  const attributes = [
    ...template.matchAll(new RegExp(`(?<![:@\\w-])(?:${VISIBLE_ATTRIBUTES.join('|')})="([^"]*)"`, 'g')),
  ]
    .map((match) => match[1])
    .filter((value) => /\p{L}/u.test(value))

  return [...texts, ...attributes]
}

/**
 * Chemins pointés de toutes les feuilles d'un catalogue.
 * @param node Catalogue ou sous-partie
 * @param prefix Chemin du nœud
 */
function keysOf(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : keysOf(value as object, `${prefix}${key}.`),
  )
}

describe('Templates', () => {
  test.each(vueFiles(RENDERER).map((file) => [path.relative(RENDERER, file), file]))(
    '%s ne contient aucun texte en dur',
    (_name, file) => {
      expect(hardcodedTexts(templateOf(readFileSync(file, 'utf8')))).toEqual([])
    },
  )
})

describe('Catalogues', () => {
  test('le renderer a les mêmes clés en français et en anglais', () => {
    expect(keysOf(en).sort()).toEqual(keysOf(fr).sort())
  })

  test('le main a les mêmes clés en français et en anglais', () => {
    expect(keysOf(mainEn).sort()).toEqual(keysOf(mainFr).sort())
  })

  test('aucun texte vide', () => {
    for (const catalog of [fr, en, mainFr, mainEn]) {
      const empty = keysOf(catalog).filter(
        (key) =>
          key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalog) === '',
      )
      expect(empty).toEqual([])
    }
  })
})
