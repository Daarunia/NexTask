import { describe, expect, test } from 'vitest'
import { isInsecureServerUrl, isLocalHostname, normalizeServerUrl } from '@core/shared/server.helper'

/** Adresse d'un serveur NexTask saisie à l'écran de connexion de NexTask Client. */

describe('normalizeServerUrl', () => {
  test.each([
    ['https://nextask.example', 'https://nextask.example'],
    ['  https://nextask.example/  ', 'https://nextask.example'],
    ['http://192.168.1.10:3000//', 'http://192.168.1.10:3000'],
    ['https://example.org/nextask/', 'https://example.org/nextask'],
    ['HTTPS://NexTask.Example', 'https://nextask.example'],
  ])('%j donne %j', (input, expected) => {
    expect(normalizeServerUrl(input)).toBe(expected)
  })

  test.each([
    '',
    'nextask.example',
    'ftp://nextask.example',
    'file:///C:/base.db',
    'https://user:pass@nextask.example',
  ])('refuse %j', (input) => {
    expect(normalizeServerUrl(input)).toBeNull()
  })
})

describe('isLocalHostname', () => {
  test.each([
    'localhost',
    'app.localhost',
    '127.0.0.1',
    '10.0.0.4',
    '172.16.0.1',
    '172.31.255.1',
    '192.168.1.10',
    '[::1]',
    'fd12:3456::1',
    'nas.local',
    'nas.lan',
  ])('%s est local', (host) => {
    expect(isLocalHostname(host)).toBe(true)
  })

  test.each(['nextask.example', '8.8.8.8', '172.32.0.1', '192.169.0.1', '11.0.0.1', '2001:db8::1'])(
    "%s n'est pas local",
    (host) => {
      expect(isLocalHostname(host)).toBe(false)
    },
  )
})

describe('isInsecureServerUrl', () => {
  test('http vers internet : jeton en clair', () => {
    expect(isInsecureServerUrl('http://nextask.example')).toBe(true)
  })

  test('https, ou http sur le réseau local : pas d’avertissement', () => {
    expect(isInsecureServerUrl('https://nextask.example')).toBe(false)
    expect(isInsecureServerUrl('http://192.168.1.10:3000')).toBe(false)
    expect(isInsecureServerUrl('http://localhost:3000')).toBe(false)
  })
})
