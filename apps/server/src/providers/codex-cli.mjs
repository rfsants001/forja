import { constants } from 'node:fs';
import { access, lstat, mkdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { ApiError } from '../storage.mjs';
import { sandboxRun } from './sandbox-run.mjs';

const destination = 'OpenAI · ChatGPT (Codex CLI)';
const authConfig = ['-c', 'cli_auth_credentials_store="file"', '-c', 'forced_login_method="chatgpt"'];

async function executable(path) {
  try {
    const actual = await realpath(path);
    if ((await stat(actual)).isFile()) {
      await access(actual, constants.X_OK);
      return actual;
    }
  } catch { /* Continue the local executable lookup. */ }
}

async function locate(binary) {
  if (binary) return executable(resolve(binary));
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.exe;.cmd;.bat').split(';').map((e) => e.toLowerCase()).filter(Boolean)
    : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const ext of extensions) {
      const found = await executable(join(dir, 'codex' + ext));
      if (found) return found;
    }
  }
}

export function codexCliProvider({
  binary, home = join(homedir(), '.local', 'share', 'forja-codex'), model, run = sandboxRun,
} = {}) {
  const models = [model || 'default'];

  async function runtime(requireLogin = true) {
    if (process.platform !== 'linux' && process.platform !== 'win32') throw new ApiError(503, 'PROVIDER_UNAVAILABLE');
    const posix = process.platform !== 'win32';
    const installed = await locate(binary);
    if (!installed) throw new ApiError(503, 'PROVIDER_UNAVAILABLE');
    if (!requireLogin) await mkdir(home, { recursive: true, mode: 0o700 });
    const directory = await realpath(home).catch(() => undefined);
    const userHome = await realpath(homedir()).catch(() => homedir());
    if (!directory || directory === dirname(directory) || directory === userHome || directory === join(userHome, '.codex')) {
      throw new ApiError(503, 'CODEX_LOGIN_REQUIRED');
    }
    const folder = await stat(directory);
    const auth = await lstat(join(directory, 'auth.json')).catch(() => undefined);
    if (!folder.isDirectory()
      || (posix && ((folder.mode & 0o077) !== 0 || folder.uid !== process.getuid()))
      || (requireLogin && (!auth?.isFile()
        || (posix && (auth.uid !== process.getuid() || (auth.mode & 0o077) !== 0))))) {
      throw new ApiError(503, 'CODEX_LOGIN_REQUIRED');
    }
    return { binary: installed, home: directory };
  }

  async function listModels(signal) {
    try {
      const config = await runtime();
      const status = await run({ ...config, argv: [...authConfig, 'login', 'status'], timeout: 5_000, signal });
      if (!/^Logged in using ChatGPT\r?$/mi.test(status)) throw new ApiError(503, 'CODEX_LOGIN_REQUIRED');
      return { destination, models, available: true };
    } catch (error) {
      const reason = error instanceof ApiError ? error.code
        : error?.code === 1 ? 'CODEX_LOGIN_REQUIRED' : 'PROVIDER_UNAVAILABLE';
      return { destination, models: [], available: false, reason };
    }
  }

  async function generate(_model, system, input, schema, signal) {
    const config = await runtime();
    const argv = [
      ...authConfig, '-a', 'never', 'exec', '--sandbox', 'read-only', '--ignore-user-config',
      '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--disable', 'shell_tool',
      '--disable', 'plugins', '--disable', 'multi_agent', '-c', 'web_search="disabled"',
      '-c', 'history.persistence="none"', '-c', 'hide_agent_reasoning=true',
      '--output-schema', 'schema.json', '--output-last-message', 'response.json',
      ...(model ? ['--model', model] : []), '-',
    ];
    let output;
    try {
      output = await run({ ...config, argv, timeout: 85_000, signal, schema, prompt: system + '\n\n' + JSON.stringify(input) });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error?.code === 'ENOENT' && error?.path?.endsWith('response.json')) {
        throw new ApiError(502, 'INVALID_PROVIDER_RESPONSE');
      }
      throw new ApiError(503, 'PROVIDER_UNAVAILABLE');
    }
    try {
      return JSON.parse(output);
    } catch {
      throw new ApiError(502, 'INVALID_PROVIDER_RESPONSE');
    }
  }
  async function login({ device, signal, onOutput }) {
    const config = await runtime(false);
    await run({
      ...config, argv: [...authConfig, 'login', ...(device ? ['--device-auth'] : [])],
      timeout: 8 * 60_000, signal, onOutput,
    });
  }

  return { id: 'codex-cli', listModels, generate, login };
}
