import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, open, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ApiError } from '../storage.mjs';

const execute = promisify(execFile);
const maxOutput = 256 * 1024;

const windowsEnvKeys = [
  'PATH', 'Path', 'SystemRoot', 'windir', 'ComSpec', 'ProgramData', 'ProgramFiles',
  'ProgramFiles(x86)', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA',
  'NUMBER_OF_PROCESSORS', 'PATHEXT',
];

async function readResponse(scratch) {
  const file = await open(join(scratch, 'response.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxOutput) throw new ApiError(502, 'INVALID_PROVIDER_RESPONSE');
    const buffer = Buffer.alloc(info.size + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== info.size) throw new ApiError(502, 'INVALID_PROVIDER_RESPONSE');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await file.close();
  }
}

async function bwrapRun({ binary, home, argv, timeout, signal, prompt, schema, onOutput }) {
  const scratch = await mkdtemp(join(tmpdir(), 'forja-codex-'));
  try {
    if (schema) await writeFile(join(scratch, 'schema.json'), JSON.stringify(schema), { mode: 0o600 });
    const child = execute('bwrap', [
      '--unshare-all', '--share-net', '--die-with-parent', '--clearenv',
      '--ro-bind', '/usr', '/usr', '--ro-bind-try', '/lib', '/lib', '--ro-bind-try', '/lib64', '/lib64',
      '--ro-bind-try', '/etc/ssl', '/etc/ssl', '--ro-bind-try', '/etc/resolv.conf', '/etc/resolv.conf',
      '--ro-bind-try', '/etc/hosts', '/etc/hosts', '--ro-bind-try', '/etc/nsswitch.conf', '/etc/nsswitch.conf',
      '--ro-bind-try', '/etc/ca-certificates', '/etc/ca-certificates',
      // Fedora and Nobara link their OpenSSL trust store to these PEM bundles.
      '--ro-bind-try', '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem', '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem',
      '--ro-bind-try', '/etc/pki/tls/certs/ca-bundle.crt', '/etc/pki/tls/certs/ca-bundle.crt',
      '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
      '--bind', scratch, '/work', '--ro-bind', binary, '/work/codex',
      '--bind', home, '/codex-home', '--dir', '/forja-home',
      '--setenv', 'BROWSER', '/usr/bin/false', '--setenv', 'NO_COLOR', '1',
      '--setenv', 'PATH', '/usr/bin', '--setenv', 'HOME', '/forja-home', '--setenv', 'CODEX_HOME', '/codex-home',
      '--chdir', '/work', '/work/codex', ...argv,
    ], { timeout, maxBuffer: maxOutput, signal });
    if (onOutput) {
      child.child.stdout?.on('data', onOutput);
      child.child.stderr?.on('data', onOutput);
    }
    if (child.child.stdin) {
      child.child.stdin.on('error', () => {});
      child.child.stdin.end(prompt);
    }
    const output = await child;
    if (!schema) return output.stdout + output.stderr;
    return readResponse(scratch);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function windowsRun({ binary, home, argv, timeout, signal, prompt, schema, onOutput }) {
  const scratch = await mkdtemp(join(tmpdir(), 'forja-codex-'));
  try {
    if (schema) await writeFile(join(scratch, 'schema.json'), JSON.stringify(schema), { mode: 0o600 });
    const forjaHome = join(scratch, 'forja-home');
    await mkdir(forjaHome, { recursive: true });
    const env = {};
    for (const key of windowsEnvKeys) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    env.CODEX_HOME = home;
    env.HOME = forjaHome;
    env.USERPROFILE = forjaHome;
    env.NO_COLOR = '1';
    env.BROWSER = '';
    // .cmd/.bat shims require shell: true; native .exe runs without a shell.
    const needsShell = /\.(cmd|bat)$/i.test(binary);
    const child = execute(binary, argv, {
      cwd: scratch, timeout, maxBuffer: maxOutput, signal,
      windowsHide: true, env, ...(needsShell ? { shell: true } : {}),
    });
    if (onOutput) {
      child.child.stdout?.on('data', onOutput);
      child.child.stderr?.on('data', onOutput);
    }
    if (child.child.stdin) {
      child.child.stdin.on('error', () => {});
      child.child.stdin.end(prompt);
    }
    const output = await child;
    if (!schema) return output.stdout + output.stderr;
    return readResponse(scratch);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export async function sandboxRun(opts) {
  return process.platform === 'win32' ? windowsRun(opts) : bwrapRun(opts);
}
