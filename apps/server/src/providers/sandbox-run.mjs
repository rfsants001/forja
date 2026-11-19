import { execFile } from 'node:child_process';
import { lstat, mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { ApiError } from '../storage.mjs';

const execute = promisify(execFile);
const maxOutput = 256 * 1024;
const windowsKeys = [
  'Path', 'SystemRoot', 'windir', 'ComSpec', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)',
  'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'NUMBER_OF_PROCESSORS', 'PATHEXT',
];
const proxyKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];

function proxies(env) {
  const values = Object.fromEntries(proxyKeys.filter((key) => env[key]).map((key) => [key, env[key]]));
  const bypass = [env.NO_PROXY ?? env.no_proxy, 'localhost', '127.0.0.1', '::1'].filter(Boolean).join(',');
  return { ...values, NO_PROXY: bypass, ...(process.platform === 'win32' ? {} : { no_proxy: bypass }) };
}

async function readResponse(scratch) {
  const path = join(scratch, 'response.json');
  if (!(await lstat(path)).isFile()) throw new ApiError(502, 'INVALID_PROVIDER_RESPONSE');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
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

export async function sandboxRun({ binary, home, argv, timeout, signal, prompt, schema, onOutput,
    platform = process.platform, env = process.env }) {
  const scratch = await mkdtemp(join(tmpdir(), 'forja-codex-'));
  try {
    if (schema) await writeFile(join(scratch, 'schema.json'), JSON.stringify(schema), { mode: 0o600 });
    const linux = platform === 'linux';
    const ca = env.CODEX_CA_CERTIFICATE || env.SSL_CERT_FILE;
    const network = proxies(env);
    const childEnv = { ...network, CODEX_HOME: home, HOME: scratch, NO_COLOR: '1' };
    if (platform === 'win32') {
      for (const key of windowsKeys) {
        const value = env[key] ?? env[key.toUpperCase()];
        if (value) childEnv[key] = value;
      }
    } else {
      childEnv.PATH = env.PATH ?? '/usr/bin:/bin';
    }
    if (!linux && ca) childEnv.CODEX_CA_CERTIFICATE = resolve(ca);
    const work = linux ? '/work' : scratch;
    const schemaPaths = new Map(['schema.json', 'response.json'].map((name) => [name, linux ? work + '/' + name : join(work, name)]));
    const args = argv.map((arg, index) => ['--output-schema', '--output-last-message'].includes(argv[index - 1])
      ? schemaPaths.get(arg) ?? arg : arg);
    let command = binary;
    let commandArgs = args;
    if (linux) {
      command = 'bwrap';
      commandArgs = [
        '--unshare-all', '--share-net', '--die-with-parent', '--clearenv',
        '--ro-bind', '/usr', '/usr', '--ro-bind-try', '/lib', '/lib', '--ro-bind-try', '/lib64', '/lib64',
        '--ro-bind-try', '/etc/ssl', '/etc/ssl', '--ro-bind-try', '/etc/resolv.conf', '/etc/resolv.conf',
        '--ro-bind-try', '/etc/hosts', '/etc/hosts', '--ro-bind-try', '/etc/nsswitch.conf', '/etc/nsswitch.conf',
        '--ro-bind-try', '/etc/ca-certificates', '/etc/ca-certificates',
        '--ro-bind-try', '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem', '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem',
        '--ro-bind-try', '/etc/pki/tls/certs/ca-bundle.crt', '/etc/pki/tls/certs/ca-bundle.crt',
        '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
        '--bind', scratch, '/work', '--ro-bind', binary, '/work/codex',
        '--bind', home, '/codex-home', '--dir', '/forja-home',
        '--setenv', 'BROWSER', '/usr/bin/false', '--setenv', 'NO_COLOR', '1',
        '--setenv', 'PATH', '/usr/bin', '--setenv', 'HOME', '/forja-home', '--setenv', 'CODEX_HOME', '/codex-home',
        ...(ca ? ['--ro-bind', await realpath(resolve(ca)), '/work/forja-ca.pem', '--setenv', 'CODEX_CA_CERTIFICATE', '/work/forja-ca.pem'] : []),
        '--chdir', '/work', '/work/codex', ...args,
      ];
    }
    const child = execute(command, commandArgs, { cwd: scratch, timeout, maxBuffer: maxOutput, signal,
      windowsHide: true, ...(linux ? {} : { env: childEnv }) });
    if (onOutput) {
      child.child.stdout?.on('data', onOutput);
      child.child.stderr?.on('data', onOutput);
    }
    child.child.stdin?.on('error', () => {});
    child.child.stdin?.end(prompt);
    const output = await child;
    return schema ? await readResponse(scratch) : output.stdout + output.stderr;
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
