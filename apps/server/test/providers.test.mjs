import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { locateCodex } from '../src/providers/codex-cli.mjs';
import { compatibleProvider } from '../src/providers/compatible.mjs';
import { sandboxRun } from '../src/providers/sandbox-run.mjs';

test('resolve the Windows native Codex bundled with the npm shim', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'forja win path '));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const shim = join(directory, 'codex.cmd');
  const binary = join(directory, 'node_modules', '@openai', 'codex', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
  await mkdir(dirname(binary), { recursive: true });
  await writeFile(shim, '@echo off');
  await writeFile(binary, 'test fixture', { mode: 0o700 });
  assert.equal(await locateCodex(undefined, 'win32', 'x64', { Path: directory }), await realpath(binary));
  assert.equal(await locateCodex(shim, 'win32', 'x64', {}), await realpath(binary));
});

test('native runner keeps host secrets out and resolves response files with spaces', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'forja native home '));
  t.after(() => rm(home, { recursive: true, force: true }));
  const result = await sandboxRun({
    platform: process.platform === 'win32' ? 'win32' : 'darwin',
    binary: process.execPath, home, timeout: 5_000, schema: { type: 'object' },
    env: { ...process.env, OPENAI_API_KEY: 'fixture-must-not-be-inherited', HTTPS_PROXY: 'http://proxy.invalid' },
    argv: ['-e', `const assert = require('node:assert/strict');
      const { readFileSync, writeFileSync } = require('node:fs');
      assert.equal(process.env.OPENAI_API_KEY, undefined);
      assert.equal(process.env.HTTPS_PROXY, 'http://proxy.invalid');
      assert(process.env.NO_PROXY.includes('127.0.0.1'));
      assert(process.env.CODEX_HOME.includes('forja native home '));
      const [schemaFlag, schema, responseFlag, response] = process.argv.slice(1);
      assert.equal(schemaFlag, '--output-schema');
      assert.equal(responseFlag, '--output-last-message');
      assert.equal(JSON.parse(readFileSync(schema)).type, 'object');
      writeFileSync(response, '{"ok":true}');`, '--', '--output-schema', 'schema.json', '--output-last-message', 'response.json'],
  });
  assert.deepEqual(JSON.parse(result), { ok: true });
});

test('compatible API keeps the URL prefix and sends the API key to its own host', async (t) => {
  let received;
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received = [request.url, request.headers.authorization, JSON.parse(body)];
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: '{"summary":"OK","suggestions":[]}' } }] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const api = compatibleProvider({ endpoint: 'http://127.0.0.1:' + server.address().port + '/provider/v1', model: 'test', key: 'example' });
  assert.deepEqual((await api.listModels()).models, ['test']);
  assert.deepEqual(await api.generate('test', 'Review', { workouts: 2 }, { type: 'object' }), { summary: 'OK', suggestions: [] });
  assert.deepEqual(received.slice(0, 2), ['/provider/v1/chat/completions', 'Bearer example']);
  assert.equal(JSON.parse(received[2].messages[1].content).workouts, 2);
  assert.equal((await compatibleProvider({ endpoint: 'http://example.com/v1', model: 'test' }).listModels()).available, false);
});
