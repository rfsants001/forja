import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function probe() {
  const home = process.env.FORJA_CODEX_HOME;
  const binary = process.env.FORJA_CODEX_BINARY;
  if (!home || !binary || process.platform !== 'linux') {
    throw new Error('Informe FORJA_CODEX_HOME e FORJA_CODEX_BINARY para executar a prova isolada em Linux.');
  }
  const work = await mkdtemp(join(tmpdir(), 'forja-codex-'));
  try {
    await copyFile(join(resolve(home), 'auth.json'), join(work, 'auth.json'));
    await writeFile(join(work, 'schema.json'), JSON.stringify({
      type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false,
    }));
    await run('bwrap', [
      '--unshare-all', '--share-net', '--die-with-parent', '--clearenv',
      '--ro-bind', '/usr', '/usr', '--ro-bind-try', '/lib', '/lib', '--ro-bind-try', '/lib64', '/lib64',
      '--ro-bind-try', '/etc/ssl', '/etc/ssl', '--ro-bind-try', '/etc/resolv.conf', '/etc/resolv.conf',
      '--ro-bind-try', '/etc/hosts', '/etc/hosts', '--ro-bind-try', '/etc/nsswitch.conf', '/etc/nsswitch.conf',
      '--ro-bind-try', '/etc/ca-certificates', '/etc/ca-certificates',
      '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
      '--bind', work, '/probe', '--ro-bind', resolve(binary), '/probe/codex',
      '--setenv', 'PATH', '/usr/bin', '--setenv', 'HOME', '/probe', '--setenv', 'CODEX_HOME', '/probe',
      '--chdir', '/probe', '/probe/codex', '-a', 'never', 'exec', '--sandbox', 'read-only',
      '--ignore-user-config', '--ephemeral', '--skip-git-repo-check',
      '--output-schema', '/probe/schema.json', '--output-last-message', '/probe/response.json',
      'Teste sintético de integração da Forja. Responda exclusivamente com {"ok":true}. Não use ferramentas.',
    ], { timeout: 90_000, maxBuffer: 512 * 1024 });
    const result = JSON.parse(await readFile(join(work, 'response.json'), 'utf8'));
    if (result.ok !== true || Object.keys(result).length !== 1) throw new Error('Saída inválida.');
    console.log('Prova Codex concluída com dados sintéticos.');
  } catch {
    throw new Error('A prova Codex falhou. Confira o login oficial dedicado, o binário e o Bubblewrap.');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

probe().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
