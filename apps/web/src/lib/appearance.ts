import type { Settings } from '@forja/core';

export function applyAppearance(theme: Settings['theme'], accent: Settings['accent'], systemLight: boolean) {
  const root = document.documentElement;
  root.dataset.theme = theme === 'system' ? (systemLight ? 'light' : 'dark') : theme;
  root.dataset.accent = accent ?? 'flame';
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', root.dataset.theme === 'light' ? '#f6f5fa' : '#151525');
}
