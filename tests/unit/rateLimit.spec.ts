import { afterEach, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  FILE_RATE_LIMIT_MAX,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW,
  isLoopbackAddress,
  registerRateLimit,
} from '@core/server/helpers/rateLimit.helper'

describe('isLoopbackAddress', () => {
  it('reconnaît la machine locale en IPv4, IPv6 et IPv4 vue en IPv6', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('127.1.2.3')).toBe(true)
    expect(isLoopbackAddress('::1')).toBe(true)
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true)
  })

  it('refuse les autres adresses', () => {
    expect(isLoopbackAddress('203.0.113.5')).toBe(false)
    expect(isLoopbackAddress('::ffff:203.0.113.5')).toBe(false)
    expect(isLoopbackAddress('10.127.0.1')).toBe(false)
    expect(isLoopbackAddress('')).toBe(false)
  })
})

describe('registerRateLimit', () => {
  let fastify: FastifyInstance

  /** Serveur avec une route sans réglage et une route de fichiers. */
  async function server(options?: { exemptAll?: boolean }) {
    fastify = Fastify()
    await registerRateLimit(fastify, options)
    fastify.get('/plain', async () => ({ ok: true }))
    fastify.get(
      '/file',
      { config: { rateLimit: { max: FILE_RATE_LIMIT_MAX, timeWindow: RATE_LIMIT_WINDOW } } },
      async () => ({ ok: true }),
    )
    await fastify.ready()
    return fastify
  }

  /** Codes de statut de `count` requêtes successives. */
  async function statuses(url: string, remoteAddress: string, count: number) {
    const codes: number[] = []
    for (let i = 0; i < count; i++) {
      codes.push((await fastify.inject({ method: 'GET', url, remoteAddress })).statusCode)
    }
    return codes
  }

  afterEach(async () => {
    await fastify?.close()
  })

  it("refuse un client distant au-delà de la limite d'une route de fichiers", async () => {
    await server()
    const codes = await statuses('/file', '203.0.113.5', FILE_RATE_LIMIT_MAX + 1)
    expect(codes.slice(0, FILE_RATE_LIMIT_MAX).every((code) => code === 200)).toBe(true)
    expect(codes.at(-1)).toBe(429)
  })

  it('applique la limite générale aux routes sans réglage', async () => {
    await server()
    const codes = await statuses('/plain', '203.0.113.5', RATE_LIMIT_MAX + 1)
    expect(codes.at(-2)).toBe(200)
    expect(codes.at(-1)).toBe(429)
  })

  it('ne limite jamais la machine locale', async () => {
    await server()
    const codes = await statuses('/file', '127.0.0.1', FILE_RATE_LIMIT_MAX + 5)
    expect(codes.every((code) => code === 200)).toBe(true)
  })

  it('ne limite aucun client en mode test (serveur autonome dans un conteneur)', async () => {
    await server({ exemptAll: true })
    const codes = await statuses('/file', '172.17.0.1', FILE_RATE_LIMIT_MAX + 5)
    expect(codes.every((code) => code === 200)).toBe(true)
  })
})
