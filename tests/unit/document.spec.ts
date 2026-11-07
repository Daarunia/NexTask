import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { documentsDirFor } from '@core/database/databaseFile'
import { BYTES_PER_MB, DOCUMENT_NAME_MAX_LENGTH } from '@core/shared/document.constants'
import {
  documentContentDisposition,
  documentLimitProblem,
  documentNameFromDisposition,
  isExecutableDocument,
  sanitizeDocumentName,
  uniqueDocumentName,
} from '@core/shared/document.helper'

/**
 * Tests unitaires des règles pures sur les documents joints aux tâches : nom de
 * fichier, limites, en-tête de téléchargement et dossier d'une base.
 */

describe('sanitizeDocumentName', () => {
  test('garde un nom ordinaire, accents et émojis compris', () => {
    expect(sanitizeDocumentName('devis 2026.pdf')).toBe('devis 2026.pdf')
    expect(sanitizeDocumentName('été 🎉.png')).toBe('été 🎉.png')
    expect(sanitizeDocumentName('archive.tar.gz')).toBe('archive.tar.gz')
  })

  test('remplace les séparateurs : un nom ne désigne jamais un chemin', () => {
    expect(sanitizeDocumentName(String.raw`..\..\windows\x.dll`)).toBe('.._.._windows_x.dll')
    expect(sanitizeDocumentName('../../etc/passwd')).toBe('.._.._etc_passwd')
    expect(sanitizeDocumentName('C:/a.txt')).toBe('C__a.txt')
  })

  test('remplace les caractères interdits sous Windows, dont un flux NTFS', () => {
    expect(sanitizeDocumentName('rapport.pdf:x.exe')).toBe('rapport.pdf_x.exe')
    expect(sanitizeDocumentName('a<b>c"d|e?f*.txt')).toBe('a_b_c_d_e_f_.txt')
  })

  test('remplace les caractères de contrôle', () => {
    expect(sanitizeDocumentName('a\u0000b\nc\u007f.txt')).toBe('a_b_c_.txt')
  })

  test('retire les points et les espaces de fin, et les espaces de début', () => {
    expect(sanitizeDocumentName('  facture.pdf. . ')).toBe('facture.pdf')
    expect(sanitizeDocumentName('sans extension...')).toBe('sans extension')
  })

  test.each(['', '   ', '.', '..', ' . . '])('refuse un nom vide une fois nettoyé : %j', (name) => {
    expect(sanitizeDocumentName(name)).toBeNull()
  })

  test.each(['CON', 'con.txt', 'NUL', 'nul.tar.gz', 'COM1', 'lpt9.pdf', 'Aux.doc', 'PRN'])(
    'préfixe un nom réservé par Windows : %s',
    (name) => {
      expect(sanitizeDocumentName(name)).toBe(`_${name}`)
    },
  )

  test.each(['console.txt', 'nullable.pdf', 'com.txt', 'auxiliaire'])(
    'garde un nom proche d’un nom réservé : %s',
    (name) => {
      expect(sanitizeDocumentName(name)).toBe(name)
    },
  )

  test('raccourcit un nom trop long en gardant son extension', () => {
    const name = sanitizeDocumentName(`${'a'.repeat(300)}.pdf`) as string

    expect(name).toHaveLength(DOCUMENT_NAME_MAX_LENGTH)
    expect(name.endsWith('a.pdf')).toBe(true)
  })

  test('ne sépare pas les deux moitiés d’un émoji en raccourcissant', () => {
    const room = DOCUMENT_NAME_MAX_LENGTH - '.pdf'.length
    const name = sanitizeDocumentName(`${'a'.repeat(room - 1)}🎉🎉.pdf`) as string

    expect(name).toBe(`${'a'.repeat(room - 1)}.pdf`)
  })

  test('une très longue fin après le dernier point n’est pas une extension', () => {
    const name = sanitizeDocumentName(`a.${'b'.repeat(300)}`) as string

    expect(name).toHaveLength(DOCUMENT_NAME_MAX_LENGTH)
    expect(name.startsWith('a.b')).toBe(true)
  })
})

describe('uniqueDocumentName', () => {
  test('garde un nom libre', () => {
    expect(uniqueDocumentName('a.pdf', [])).toBe('a.pdf')
    expect(uniqueDocumentName('a.pdf', ['b.pdf'])).toBe('a.pdf')
  })

  test('numérote un nom pris, casse ignorée', () => {
    expect(uniqueDocumentName('a.pdf', ['A.PDF'])).toBe('a (2).pdf')
    expect(uniqueDocumentName('a.pdf', ['a.pdf', 'a (2).pdf'])).toBe('a (3).pdf')
    expect(uniqueDocumentName('a.pdf', ['a.pdf', 'A (2).PDF', 'a (3).pdf'])).toBe('a (4).pdf')
  })

  test('numérote un nom sans extension ou à plusieurs points', () => {
    expect(uniqueDocumentName('notes', ['notes'])).toBe('notes (2)')
    expect(uniqueDocumentName('a.tar.gz', ['a.tar.gz'])).toBe('a.tar (2).gz')
    expect(uniqueDocumentName('.env', ['.env'])).toBe('.env (2)')
  })

  test('reste dans la longueur maximale', () => {
    const name = `${'a'.repeat(DOCUMENT_NAME_MAX_LENGTH - 4)}.pdf`

    const unique = uniqueDocumentName(name, [name])

    expect(unique).toHaveLength(DOCUMENT_NAME_MAX_LENGTH)
    expect(unique.endsWith(' (2).pdf')).toBe(true)
  })
})

describe('documentLimitProblem', () => {
  const limits = { maxSizeMb: 100, maxPerTask: 10 }

  test('accepte jusqu’à la limite comprise', () => {
    expect(documentLimitProblem(0, 0, limits)).toBeNull()
    expect(documentLimitProblem(100 * BYTES_PER_MB, 9, limits)).toBeNull()
  })

  test('refuse un octet de trop', () => {
    expect(documentLimitProblem(100 * BYTES_PER_MB + 1, 0, limits)).toBe('fileTooLarge')
  })

  test('refuse un document de trop, y compris au-delà d’une limite abaissée', () => {
    expect(documentLimitProblem(1, 10, limits)).toBe('taskFull')
    expect(documentLimitProblem(1, 12, limits)).toBe('taskFull')
  })
})

describe('documentContentDisposition', () => {
  test('est toujours une pièce jointe, encodée en ASCII', () => {
    expect(documentContentDisposition('a.pdf')).toBe("attachment; filename*=UTF-8''a.pdf")
    expect(documentContentDisposition('été 🎉.pdf')).toBe(
      "attachment; filename*=UTF-8''%C3%A9t%C3%A9%20%F0%9F%8E%89.pdf",
    )
  })

  test('encode les caractères que la RFC 5987 n’autorise pas tels quels', () => {
    expect(documentContentDisposition("l'été (1)*.pdf")).toBe(
      "attachment; filename*=UTF-8''l%27%C3%A9t%C3%A9%20%281%29%2A.pdf",
    )
  })
})

describe('documentsDirFor', () => {
  test('se déduit du nom de la base, à côté d’elle', () => {
    expect(documentsDirFor(path.join('C:', 'data', 'nextask.db'))).toBe(path.join('C:', 'data', 'nextask-documents'))
    expect(documentsDirFor(path.join('C:', 'data', 'app.db'))).toBe(path.join('C:', 'data', 'app-documents'))
  })

  test('deux bases d’un même dossier ne le partagent pas', () => {
    const folder = path.join('C:', 'data')

    expect(documentsDirFor(path.join(folder, 'a.db'))).not.toBe(documentsDirFor(path.join(folder, 'b.db')))
  })

  test('accepte un nom sans extension ou à plusieurs points', () => {
    expect(documentsDirFor(path.join('C:', 'data', 'base'))).toBe(path.join('C:', 'data', 'base-documents'))
    expect(documentsDirFor(path.join('C:', 'data', 'nextask.2026.db'))).toBe(
      path.join('C:', 'data', 'nextask.2026-documents'),
    )
  })
})

describe('documentNameFromDisposition', () => {
  test('relit le nom écrit par documentContentDisposition, caractères spéciaux compris', () => {
    for (const name of ["devis d'été (v2).pdf", 'rapport*final.txt', '报告 🎉.docx', 'a;b.txt']) {
      expect(documentNameFromDisposition(documentContentDisposition(name))).toBe(name)
    }
  })

  test('null sans nom encodé, ou pour un encodage invalide', () => {
    expect(documentNameFromDisposition('')).toBeNull()
    expect(documentNameFromDisposition('attachment; filename="x.pdf"')).toBeNull()
    expect(documentNameFromDisposition("attachment; filename*=UTF-8''%E9%ZZ")).toBeNull()
  })
})

describe('isExecutableDocument', () => {
  test('repère programmes, scripts et raccourcis, casse ignorée', () => {
    for (const name of ['setup.exe', 'RUN.BAT', 'script.ps1', 'macro.vbs', 'lien.lnk', 'outil.jar', '.cmd']) {
      expect(isExecutableDocument(name), name).toBe(true)
    }
  })

  test('laisse ouvrir documents, images et archives', () => {
    for (const name of ['devis.pdf', 'photo.JPG', 'notes.txt', 'archive.zip', 'exe', 'readme', 'setup.exe.pdf']) {
      expect(isExecutableDocument(name), name).toBe(false)
    }
  })
})
