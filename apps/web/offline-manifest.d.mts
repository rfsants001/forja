import type { Plugin } from 'vite';
export function offlineManifest(): Plugin;
export function precacheIntegrity<T extends { url: string }>(entries: T[], directory: string): {
  manifest: Array<T & { integrity: string }>;
  warnings: string[];
};
