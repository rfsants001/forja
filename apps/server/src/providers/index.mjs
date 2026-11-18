import { codexCliProvider } from './codex-cli.mjs';
import { ollamaProvider } from './ollama.mjs';

export function codexFromEnv(env) {
  return codexCliProvider({ binary: env.FORJA_CODEX_BINARY, home: env.FORJA_CODEX_HOME, model: env.FORJA_CODEX_MODEL });
}

export function resolveProvider(env, ollama = env.FORJA_OLLAMA_URL ?? 'http://127.0.0.1:11434') {
  switch (env.FORJA_COACH_PROVIDER ?? 'ollama') {
    case 'ollama': return ollamaProvider(ollama);
    case 'codex-cli': return codexFromEnv(env);
    default: throw new Error('FORJA_COACH_PROVIDER deve ser ollama ou codex-cli.');
  }
}
