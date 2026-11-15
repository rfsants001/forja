import { t, type useT } from './i18n';

export class UiError extends Error {
  constructor(readonly key: string, readonly args?: (string | number)[]) {
    super(t(key, 'pt', args));
  }
}

export function errorMessage(error: unknown, translate: ReturnType<typeof useT>, fallback: string): string {
  if (error instanceof UiError) return translate(error.key, error.args);
  return error instanceof Error ? error.message : translate(fallback);
}
