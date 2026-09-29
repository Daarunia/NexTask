import type { CacheEntry } from './cache.types'

export interface BaseEntityState<T> {
  allEntities: CacheEntry<T[]> | null
  ttl: number
}
