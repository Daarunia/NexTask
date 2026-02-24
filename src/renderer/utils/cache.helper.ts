import { CacheEntry } from "../types/cache.types";

export function isCacheValid<T>(
  cache: CacheEntry<T> | null,
  ttl: number,
): boolean {
  if (!cache) return false;
  return Date.now() - cache.timestamp <= ttl;
}
