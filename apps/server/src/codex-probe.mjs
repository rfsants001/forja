import { createCoach } from './coach.mjs';
import { codexCliProvider } from './providers/codex-cli.mjs';

const coach = createCoach(codexCliProvider({
  binary: process.env.FORJA_CODEX_BINARY,
  home: process.env.FORJA_CODEX_HOME,
  model: process.env.FORJA_CODEX_MODEL,
}));

try {
  const result = await coach.providers();
  if (!result.available) {
    throw new Error(result.reason === 'CODEX_LOGIN_REQUIRED'
      ? 'Entre com o ChatGPT no perfil dedicado do Codex CLI.'
      : 'Confira o binário oficial do Codex CLI e o Bubblewrap.');
  }
  await coach.test({ model: result.models[0] });
  console.log('Prova Codex concluída com dados sintéticos.');
} catch (error) {
  console.error(error?.code ? 'A prova Codex falhou: ' + error.code : error.message);
  process.exitCode = 1;
}
