import type { StateStorage } from 'zustand/middleware';

export function createDraftStorage(storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, report: (failed: boolean) => void): StateStorage {
  return {
    getItem(key) { try { return storage().getItem(key); } catch (error) { report(true); throw error; } },
    setItem(key, value) { try { storage().setItem(key, value); report(false); } catch { report(true); } },
    removeItem(key) { try { storage().removeItem(key); report(false); } catch { report(true); } },
  };
}
let failed = false;
let readFailed = false;
export const sessionReadFailed = () => readFailed;
export function reportSessionRead(value: boolean) { readFailed = value; reportSessionStorage(value); }
const listeners = new Set<() => void>();
export const sessionStorageFailed = () => failed;
export function subscribeSessionStorage(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function reportSessionStorage(value: boolean) { failed = value; listeners.forEach((listener) => listener()); }
export const draftStorage = createDraftStorage(() => localStorage, reportSessionStorage);
