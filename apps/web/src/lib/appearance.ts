import { DEFAULT_SETTINGS, type Settings } from '@forja/core';

export function applyAppearance(theme: Settings['theme'], accent: Settings['accent'], systemLight: boolean) {
  const root = document.documentElement;
  root.dataset.theme = theme === 'system' ? (systemLight ? 'light' : 'dark') : theme;
  root.dataset.accent = accent ?? DEFAULT_SETTINGS.accent;
  const background = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
}
