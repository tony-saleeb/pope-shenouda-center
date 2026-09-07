type CacheEntry<T> = { value: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();
const imageStore = new Map<string, CacheEntry<unknown>>();
const IMAGE_MAX_ENTRIES = 40;

function readCache<T>(map: Map<string, CacheEntry<unknown>>, key: string): T | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function getAdminReadCache<T>(key: string): T | undefined {
  return readCache<T>(store, key);
}

export function setAdminReadCache<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function getAdminImageCache<T>(key: string): T | undefined {
  return readCache<T>(imageStore, key);
}

export function setAdminImageCache<T>(key: string, value: T, ttlMs: number): T {
  if (imageStore.size >= IMAGE_MAX_ENTRIES) {
    const oldest = imageStore.keys().next().value;
    if (typeof oldest === 'string') imageStore.delete(oldest);
  }
  imageStore.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function invalidateAdminImageCache(registrantId?: string): void {
  if (!registrantId) {
    imageStore.clear();
    return;
  }
  const suffix = `:${registrantId}`;
  for (const key of [...imageStore.keys()]) {
    if (key.endsWith(suffix)) imageStore.delete(key);
  }
}

export function invalidateAdminReadCache(): void {
  store.clear();
  imageStore.clear();
}
