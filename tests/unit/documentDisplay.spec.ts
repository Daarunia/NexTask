import { describe, expect, test } from 'vitest'
import { documentIcon, formatBytes } from '../../src/renderer/utils/document.helper'

/**
 * Tests unitaires de l'affichage des documents joints aux tâches : taille
 * lisible et icône selon le type de fichier.
 */

// Espaces insécables et fines insécables placées par Intl, ramenées à une espace
const plain = (text: string) => text.replaceAll(/[  ]/g, ' ')

describe('formatBytes', () => {
  test("garde l'octet sous 1 Ko, sans décimale", () => {
    expect(plain(formatBytes(0, 'en'))).toBe('0 byte')
    expect(plain(formatBytes(512, 'en'))).toBe('512 byte')
  })

  test("passe à l'unité supérieure dès 1024, avec une décimale au plus", () => {
    expect(plain(formatBytes(1024, 'en'))).toBe('1 kB')
    expect(plain(formatBytes(1536, 'en'))).toBe('1.5 kB')
    expect(plain(formatBytes(5 * 1024 * 1024 + 300_000, 'en'))).toBe('5.3 MB')
    expect(plain(formatBytes(3 * 1024 ** 3, 'en'))).toBe('3 GB')
  })

  test("s'arrête au Go, et suit la langue", () => {
    expect(plain(formatBytes(2048 * 1024 ** 3, 'en'))).toBe('2,048 GB')
    expect(plain(formatBytes(1536, 'fr'))).toBe('1,5 ko')
  })
})

describe('documentIcon', () => {
  test("choisit l'icône selon l'extension, casse ignorée", () => {
    expect(documentIcon('devis.PDF')).toBe('pi-file-pdf')
    expect(documentIcon('notes.docx')).toBe('pi-file-word')
    expect(documentIcon('budget.xlsx')).toBe('pi-file-excel')
    expect(documentIcon('photo.jpeg')).toBe('pi-image')
    expect(documentIcon('demo.mp4')).toBe('pi-video')
  })

  test('icône de fichier par défaut, sans extension ou inconnue', () => {
    expect(documentIcon('README')).toBe('pi-file')
    expect(documentIcon('archive.zip')).toBe('pi-file')
  })
})
