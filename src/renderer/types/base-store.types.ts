import type { CacheEntry } from "./cache.types";

export interface BaseEntityState<T> {
  entities: Record<number, CacheEntry<T>>;
  allEntities: CacheEntry<T[]> | null;
  ttl: number;
  lastFetch: number | null;
  baseUrl: string;
}
