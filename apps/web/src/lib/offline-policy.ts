export type TransferState = 'local' | 'pending' | 'running' | 'updated' | 'waiting' | 'conflict';

export function transferState(linked: boolean, pending: number, conflict: boolean,
  runtime: string, lastSync?: number): TransferState {
  if (!linked) return 'local';
  if (conflict) return 'conflict';
  if (runtime === 'running') return 'running';
  if (pending > 0) return 'pending';
  if (runtime === 'waiting') return 'waiting';
  return runtime === 'updated' && lastSync ? 'updated' : 'waiting';
}

export function readOfflineManifest(value: unknown): { path: string; cacheKey: string }[] {
  if (!value || typeof value !== 'object') throw new Error('INVALID_OFFLINE_MANIFEST');
  const { version, assets } = value as { version?: unknown; assets?: unknown };
  if (typeof version !== 'string' || !Array.isArray(assets) || !assets.includes('/index.html') || !assets.length
    || !assets.every((path) => typeof path === 'string' && /^\/(?!\/)/.test(path)
      && !path.includes('..') && !path.startsWith('/api/') && !/[?#]/.test(path))) {
    throw new Error('INVALID_OFFLINE_MANIFEST');
  }
  const cacheKeys = (value as { cacheKeys?: Record<string, unknown> }).cacheKeys;
  if (!cacheKeys || typeof cacheKeys !== 'object') throw new Error('INVALID_OFFLINE_MANIFEST');
  return [...new Set(assets as string[])].map((path) => {
    const cacheKey = cacheKeys[path];
    if (typeof cacheKey !== 'string' || !/^\/(?!\/)/.test(cacheKey)
      || new URL(cacheKey, 'https://forja.invalid').pathname !== path) throw new Error('INVALID_OFFLINE_MANIFEST');
    return { path, cacheKey };
  });
}
