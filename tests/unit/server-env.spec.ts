import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { localeFromAcceptLanguage, readServerEnv, ServerEnvError, TOKEN_MIN_LENGTH } from '../../src/server/env'
import { createTokenCheck, requestPath } from '../../src/server/auth'
import { formatLogLine } from '../../src/server/logger'

const TOKEN = 'a'.repeat(TOKEN_MIN_LENGTH)
const CWD = path.resolve('/srv/nextask')

describe('readServerEnv', () => {
  test('applique les valeurs par défaut', () => {
    expect(readServerEnv({ NEXTASK_TOKEN: TOKEN }, CWD)).toEqual({
      token: TOKEN,
      dataDir: path.join(CWD, 'data'),
      host: '0.0.0.0',
      port: 3000,
      locale: 'en',
      corsOrigins: [],
      test: false,
    })
  })

  test('lit chaque variable', () => {
    const env = readServerEnv(
      {
        NEXTASK_TOKEN: ` ${TOKEN}b `,
        NEXTASK_DATA_DIR: '/data',
        HOST: '127.0.0.1',
        PORT: '8080',
        NEXTASK_LOCALE: 'fr',
        NEXTASK_CORS_ORIGINS: 'https://a.example, https://b.example,,',
        NEXTASK_TEST: '1',
      },
      CWD,
    )
    expect(env).toEqual({
      token: `${TOKEN}b`,
      dataDir: path.resolve(CWD, '/data'),
      host: '127.0.0.1',
      port: 8080,
      locale: 'fr',
      corsOrigins: ['https://a.example', 'https://b.example'],
      test: true,
    })
  })

  test('refuse un jeton absent ou trop court', () => {
    expect(() => readServerEnv({}, CWD)).toThrow(ServerEnvError)
    expect(() => readServerEnv({ NEXTASK_TOKEN: TOKEN.slice(1) }, CWD)).toThrow(ServerEnvError)
  })

  test.each(['0', '65536', 'abc', '80.5'])('refuse le port %s', (port) => {
    expect(() => readServerEnv({ NEXTASK_TOKEN: TOKEN, PORT: port }, CWD)).toThrow(ServerEnvError)
  })

  test('refuse une langue inconnue', () => {
    expect(() => readServerEnv({ NEXTASK_TOKEN: TOKEN, NEXTASK_LOCALE: 'de' }, CWD)).toThrow(ServerEnvError)
  })
})

describe('localeFromAcceptLanguage', () => {
  test.each([
    [undefined, null],
    ['', null],
    ['fr-CA', 'fr'],
    ['de-DE, es;q=0.8, en;q=0.9', 'en'],
    ['de, it', null],
    ['en;q=0, pt', 'pt'],
    ['ZH-hans', 'zh'],
    ['es, fr', 'es'],
  ])('%s donne %s', (header, expected) => {
    expect(localeFromAcceptLanguage(header)).toBe(expected)
  })
})

describe('createTokenCheck', () => {
  const isAuthorized = createTokenCheck(TOKEN)

  test('accepte le jeton attendu', () => {
    expect(isAuthorized(`Bearer ${TOKEN}`)).toBe(true)
    expect(isAuthorized(`bearer   ${TOKEN}`)).toBe(true)
  })

  test.each([undefined, '', TOKEN, `Basic ${TOKEN}`, `Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(1)}`, 'Bearer'])(
    'refuse %s',
    (header) => {
      expect(isAuthorized(header)).toBe(false)
    },
  )
})

test('requestPath retire la chaîne de requête', () => {
  expect(requestPath('/health?probe=1')).toBe('/health')
  expect(requestPath('/boards')).toBe('/boards')
})

test('formatLogLine écrit une ligne JSON, pile des erreurs comprise', () => {
  const error = new Error('boom')
  const line = JSON.parse(
    formatLogLine('error', ['Échec :', error, { id: 3 }], new Date('2026-11-10T10:00:00.000Z')),
  ) as Record<string, string>

  expect(line.time).toBe('2026-11-10T10:00:00.000Z')
  expect(line.level).toBe('error')
  expect(line.msg).toContain('Échec : Error: boom')
  expect(line.msg).toContain('{ id: 3 }')
})
