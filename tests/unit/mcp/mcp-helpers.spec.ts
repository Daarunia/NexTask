import { describe, expect, test } from 'vitest'
import { compact, localIso } from '@core/server/mcp/format'
import { resolveBoard, resolveStage, ToolError, type Workspace } from '@core/server/mcp/resolve'
import { parseTaskDate, splitCapture } from '@core/server/mcp/tools/write'
import { noteFileName } from '@core/server/mcp/tools/documents'
import { daysBefore } from '@core/server/mcp/tools/read'
import { createTokenCheck, generateToken } from '@core/server/helpers/auth.helper'
import { claudeCodeCommand, isMcpCopyKind, mcpRemoteConfig, testMcpPort } from '@core/shared/mcp.constants'
import { BOARDS, STAGES } from './fake-api'

/**
 * Logique pure de l'accès MCP : références par nom, dates, capture, jeton et
 * configurations à copier. Fuseau des tests : Europe/Paris (cf. vitest.config.ts).
 */

const workspace: Workspace = { boards: BOARDS, stages: STAGES }

describe('références par nom ou id', () => {
  test('trouve un tableau sans tenir compte de la casse ni des accents, ou par id', () => {
    expect(resolveBoard(workspace, 'perso').id).toBe(1)
    expect(resolveBoard(workspace, ' TRAVAIL ').id).toBe(2)
    expect(resolveBoard(workspace, 2).id).toBe(2)
    expect(resolveBoard(workspace, '1').id).toBe(1)
  })

  test('un nom passe avant un id de même écriture', () => {
    const named = { ...workspace, boards: [...BOARDS, { id: 3, name: '1', color: null, position: 2 }] }
    expect(resolveBoard(named, '1').id).toBe(3)
  })

  test('refuse un tableau inconnu en listant les tableaux', () => {
    expect(() => resolveBoard(workspace, 'Maison')).toThrow(ToolError)
    expect(() => resolveBoard(workspace, 'Maison')).toThrow('Available: "Perso" (id 1), "Travail" (id 2)')
  })

  test('trouve une colonne dans le tableau donné, et refuse une ambiguïté sans tableau', () => {
    expect(resolveStage(workspace, 'a faire', 'Travail').id).toBe(20)
    expect(resolveStage(workspace, 'en cours').id).toBe(11)
    expect(() => resolveStage(workspace, 'À faire')).toThrow('several boards (Perso, Travail)')
    expect(() => resolveStage(workspace, 'En cours', 'Travail')).toThrow('column of board "Travail"')
  })
})

describe('dates', () => {
  test('écrit une date locale à la minute, avec le décalage du fuseau', () => {
    expect(localIso('2026-11-19T09:30:00.000Z')).toBe('2026-11-19T10:30+01:00')
    expect(localIso('2026-07-01T09:30:00.000Z')).toBe('2026-07-01T11:30+02:00')
  })

  test('lit un jour (9 h), un jour et une heure locaux, ou une date ISO', () => {
    expect(parseTaskDate('2026-12-05')).toBe(new Date(2026, 11, 5, 9).toISOString())
    expect(parseTaskDate('2026-12-05T18:15')).toBe(new Date(2026, 11, 5, 18, 15).toISOString())
    expect(parseTaskDate('2026-12-05T18:15:00Z')).toBe('2026-12-05T18:15:00.000Z')
    expect(() => parseTaskDate('vendredi')).toThrow('Invalid date')
  })

  test('recule d’un nombre de jours à la même heure locale, changement d’heure compris', () => {
    expect(daysBefore(new Date(2026, 10, 1, 10), 7)).toEqual(new Date(2026, 9, 25, 10))
  })
})

describe('capture et notes', () => {
  test('prend la première ligne non vide pour titre et garde le reste en description', () => {
    expect(splitCapture('\r\n Titre \r\nLigne 1\r\n\r\nLigne 2 \n')).toEqual({
      title: 'Titre',
      description: 'Ligne 1\n\nLigne 2',
    })
    expect(splitCapture('Seul')).toEqual({ title: 'Seul', description: '' })
  })

  test('ajoute .md à une note sans extension', () => {
    expect(noteFileName(' CR réunion ')).toBe('CR réunion.md')
    expect(noteFileName('data.csv')).toBe('data.csv')
  })

  test('retire les champs vides d’un résultat', () => {
    expect(compact({ a: 1, b: null, c: undefined, d: [], e: [1], f: '' })).toEqual({ a: 1, e: [1], f: '' })
  })
})

describe('jeton', () => {
  test('accepte le bon jeton en Bearer, refuse les autres', () => {
    const check = createTokenCheck('secret')
    expect(check('Bearer secret')).toBe(true)
    expect(check('bearer  secret ')).toBe(true)
    expect(check('Bearer secrets')).toBe(false)
    expect(check('secret')).toBe(false)
    expect(check(undefined)).toBe(false)
  })

  test('génère des jetons base64url de 256 bits, tous différents', () => {
    const token = generateToken()
    expect(token).toMatch(/^[\w-]{43}$/)
    expect(generateToken()).not.toBe(token)
  })
})

describe('configurations à copier', () => {
  test('commande Claude Code et JSON mcp-remote', () => {
    const url = 'http://127.0.0.1:47800/mcp'
    expect(claudeCodeCommand(url, 'abc')).toBe(
      'claude mcp add --transport http nextask http://127.0.0.1:47800/mcp --header "Authorization: Bearer abc"',
    )
    expect(JSON.parse(mcpRemoteConfig(url, 'abc'))).toEqual({
      mcpServers: {
        nextask: {
          command: 'npx',
          args: ['-y', 'mcp-remote', url, '--allow-http', '--header', 'Authorization:Bearer abc'],
        },
      },
    })
  })

  test('ne connaît que deux configurations, et un port de test par worker', () => {
    expect(isMcpCopyKind('claudeCode')).toBe(true)
    expect(isMcpCopyKind('token')).toBe(false)
    expect(testMcpPort(2)).toBe(3202)
  })
})
