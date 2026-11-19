import { constants } from 'node:fs';
import { access, lstat, mkdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
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

async function npmExecutable(packageRoot, platform, arch) {
  const cpu = arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x86_64' : undefined;
  if (!cpu) return undefined;
  const target = { linux: cpu + '-unknown-linux-musl', darwin: cpu + '-apple-darwin', win32: cpu + '-pc-windows-msvc' }[platform];
  const require = createRequire(join(packageRoot, 'package.json'));
  let vendor = join(packageRoot, 'vendor');
  try { vendor = join(dirname(require.resolve(`@openai/codex-${platform}-${arch}/package.json`)), 'vendor'); } catch {}
  const filename = platform === 'win32' ? 'codex.exe' : 'codex';
  return await executable(join(vendor, target, 'bin', filename)) ?? executable(join(vendor, target, 'codex', filename));
}

export async function locateCodex(binary, platform = process.platform, arch = process.arch, env = process.env) {
  const windows = platform === 'win32';
  const filename = windows ? 'codex.exe' : 'codex';
  if (binary && (!windows || /\.exe$/i.test(binary))) {
    const resolved = await executable(resolve(binary));
    if (!resolved) return undefined;
    if (/\/bin\/codex\.js$/.test(resolved)) return npmExecutable(dirname(dirname(resolved)), platform, arch);
    return resolved;
  }
  const path = (env.PATH ?? env.Path ?? '').split(windows ? ';' : ':').map((item) => item.trim().replace(/^"|"$/g, ''));
  if (windows && env.LOCALAPPDATA) path.push(join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'));
  if (windows && env.APPDATA) path.push(join(env.APPDATA, 'npm'));
  path.push(join(homedir(), '.local', 'bin'));
  const directories = binary ? [dirname(resolve(binary))] : [...new Set(path.filter(isAbsolute))];
  for (const dir of directories) {
    const found = !binary && await executable(join(dir, filename));
    if (found && !/\/bin\/codex\.js$/.test(found)) return found;
    const root = found ? dirname(dirname(found)) : join(dir, 'node_modules', '@openai', 'codex');
    const packaged = await npmExecutable(root, platform, arch);
    if (packaged) return packaged;
  }
}

export function codexCliProvider({
  binary, home = join(homedir(), '.local', 'share', 'forja-codex'), model, run = sandboxRun, platform = process.platform, env = process.env,
} = {}) {
  const models = [model || 'default'];

  async function runtime(requireLogin = true) {
    if (!['linux', 'darwin', 'win32'].includes(platform)) throw new ApiError(503, 'PROVIDER_UNAVAILABLE');
    const posix = platform !== 'win32';
    const installed = await locateCodex(binary, platform, process.arch, env);
    if (!installed) throw new ApiError(503, 'CODEX_CLI_MISSING');
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
      || (requireLogin && !auth)
      || (auth && (!auth.isFile() || (posix && (auth.uid !== process.getuid() || (auth.mode & 0o077) !== 0))))) {
      throw new ApiError(503, 'CODEX_LOGIN_REQUIRED');
    }
    return { binary: installed, home: directory, platform, env };
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
