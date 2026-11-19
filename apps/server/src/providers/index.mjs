import { codexCliProvider } from './codex-cli.mjs';
import { compatibleProvider } from './compatible.mjs';
import { ollamaProvider } from './ollama.mjs';

export function codexFromEnv(env) {
  return codexCliProvider({ binary: env.FORJA_CODEX_BINARY, home: env.FORJA_CODEX_HOME, model: env.FORJA_CODEX_MODEL });
}

export function compatibleFromEnv(env) {
  return compatibleProvider({ endpoint: env.FORJA_COMPAT_URL, model: env.FORJA_COMPAT_MODEL, key: env.FORJA_COMPAT_API_KEY });
}

export function resolveProvider(env, ollama = env.FORJA_OLLAMA_URL ?? 'http://127.0.0.1:11434') {
  switch (env.FORJA_COACH_PROVIDER ?? 'ollama') {
    case 'ollama': return ollamaProvider(ollama);
    case 'codex-cli': return codexFromEnv(env);
    case 'compatible': return compatibleFromEnv(env);
    default: throw new Error('FORJA_COACH_PROVIDER deve ser ollama ou codex-cli ou compatible.');
  }
}
