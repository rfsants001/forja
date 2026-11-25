import { registerSW } from 'virtual:pwa-register';
import { readOfflineManifest } from './offline-policy';

export interface OfflineState {
  phase: 'checking' | 'ready' | 'missing' | 'error' | 'unsupported' | 'insecure' | 'development';
  online: boolean;
  updateAvailable: boolean;
  persistent: 'unknown' | 'granted' | 'denied' | 'unsupported';
  storage: 'unknown' | 'available' | 'blocked';
  installed: boolean;
}
interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let state: OfflineState = { phase: 'checking', online: navigator.onLine, updateAvailable: false,
  persistent: 'unknown', storage: 'unknown', installed: matchMedia('(display-mode: standalone)').matches
    || !!(navigator as Navigator & { standalone?: boolean }).standalone };
const listeners = new Set<() => void>();
export const offlineSnapshot = () => state;
export function subscribeOffline(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function patch(next: Partial<OfflineState>) { state = { ...state, ...next }; listeners.forEach((listener) => listener()); }
let registration: ServiceWorkerRegistration | undefined;
let updateWorker: ((reload?: boolean) => Promise<void>) | undefined;
let installEvent: InstallEvent | undefined;
let checking: Promise<void> | undefined;
let missingAssets: string[] = [];

export async function inspectStorage() {
  try {
    const key = 'forja-storage-check';
    localStorage.setItem(key, '1');
    if (localStorage.getItem(key) !== '1') throw new Error('STORAGE_BLOCKED');
    localStorage.removeItem(key);
    patch({ storage: 'available', persistent: navigator.storage?.persisted
      ? await navigator.storage.persisted() ? 'granted' : 'denied' : 'unsupported' });
  } catch { patch({ storage: 'blocked' }); }
}
export async function protectStorage() {
  try { patch({ persistent: navigator.storage?.persist
    ? await navigator.storage.persist() ? 'granted' : 'denied' : 'unsupported' }); }
  catch { patch({ persistent: 'denied' }); }
}
export function verifyOffline(): Promise<void> {
  if (checking) return checking;
  checking = (async () => {
    await inspectStorage();
    if (!window.isSecureContext) { patch({ phase: 'insecure' }); return; }
    if (!('serviceWorker' in navigator) || !('caches' in window)) { patch({ phase: 'unsupported' }); return; }
    if (import.meta.env.DEV) { patch({ phase: 'development' }); return; }
    try {
      if (!navigator.serviceWorker.controller) { patch({ phase: 'checking' }); return; }
      const response = await fetch('/offline-assets.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('OFFLINE_MANIFEST_UNAVAILABLE');
      const assets = readOfflineManifest(await response.json());
      const available = await Promise.all(assets.map(async ({ cacheKey }) => {
        const cached = await caches.match(new URL(cacheKey, location.origin));
        return !!cached?.ok;
      }));
      missingAssets = assets.filter((_entry, index) => !available[index]).map(({ path }) => path);
      patch({ phase: missingAssets.length ? 'missing' : 'ready' });
    } catch { patch({ phase: 'error' }); }
  })().finally(() => { checking = undefined; });
  return checking;
}

export async function applyAppUpdate(): Promise<boolean> {
  // Another tab can have a draft even when this tab does not know about it yet.
  try { if (JSON.parse(localStorage.getItem('forja-session') || '{}').state?.active) return false; }
  catch { return false; }
  if (!state.updateAvailable || !updateWorker) return false;
  await updateWorker(true);
  return true;
}
export async function repairOffline() {
  patch({ phase: 'checking' });
  await verifyOffline();
  if (!state.online) return;
  // The worker checks SRI against its own build before repairing a missing response.
  for (let offset = 0; offset < missingAssets.length; offset += 8) {
    await Promise.all(missingAssets.slice(offset, offset + 8).map((path) => fetch(path, { cache: 'no-store' }).catch(() => undefined)));
  }
  if (state.phase !== 'ready' && !state.updateAvailable) await registration?.update().catch(() => {});
  await verifyOffline();
}
export async function installApp(): Promise<boolean> {
  if (!installEvent) return false;
  const event = installEvent; installEvent = undefined;
  await event.prompt();
  const accepted = (await event.userChoice).outcome === 'accepted';
  if (accepted) patch({ installed: true });
  return accepted;
}
export const canPromptInstall = () => !!installEvent;
let started = false;
export function initializeOffline() {
  if (started) return;
  started = true;
  const network = () => { patch({ online: navigator.onLine }); void verifyOffline(); };
  addEventListener('online', network); addEventListener('offline', network);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void verifyOffline(); });
  addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installEvent = event as InstallEvent; patch({}); });
  addEventListener('appinstalled', () => { installEvent = undefined; patch({ installed: true }); });
  if (window.isSecureContext && 'serviceWorker' in navigator && !import.meta.env.DEV) {
    navigator.serviceWorker.addEventListener('controllerchange', () => { void verifyOffline(); });
    updateWorker = registerSW({ immediate: true,
      onNeedRefresh() { patch({ updateAvailable: true }); void verifyOffline(); },
      onOfflineReady() { void verifyOffline(); },
      onRegisteredSW(_url, value) { registration = value; void verifyOffline(); },
      onRegisterError() { patch({ phase: 'error' }); },
    });
  }
  void verifyOffline();
}
