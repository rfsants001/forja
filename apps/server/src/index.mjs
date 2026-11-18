import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, assert, ApiError } from './storage.mjs';
import { adminKey, createDeviceService } from './devices.mjs';
import { createCoachEngines } from './coach-engines.mjs';

const mime = {
  '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

function json(response, value, status = 200, cookie) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  response.writeHead(status, headers).end(JSON.stringify(value));
}

async function readJson(request, limit = 4 * 1024 * 1024) {
  assert(/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? ''), 'INVALID_CONTENT_TYPE', 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    // Keep draining this bounded request before returning an HTTP error.
    if (size <= limit) chunks.push(chunk);
    else throw new ApiError(413, 'PAYLOAD_TOO_LARGE');
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks)); } catch { throw new ApiError(400, 'INVALID_JSON'); }
  assert(body !== null && typeof body === 'object' && !Array.isArray(body));
  return body;
}

export function createForjaServer(options = {}) {
  const config = new URL(options.origin ?? 'http://127.0.0.1:8787');
  if (config.href !== config.origin + '/' || !['https:', 'http:'].includes(config.protocol)
    || (config.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(config.hostname))) {
    throw new Error('FORJA_URL deve ser uma origem HTTPS ou um endereço HTTP local.');
  }
  const directory = resolve(options.directory ?? 'data/forja');
  const staticRoot = resolve(options.staticRoot ?? fileURLToPath(new URL('../../web/dist/', import.meta.url)));
  const key = adminKey(directory);
  const store = createStore(resolve(directory, 'forja.db'));
  const devices = createDeviceService(store, config.origin, key);
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  new Intl.DateTimeFormat('en', { timeZone });
  const coach = createCoachEngines(store, options);
  const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
  const localOrigin = loopback.has(config.hostname);
  const localHost = (request) => localOrigin
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)
    && [...loopback].some((name) => request.headers.host === name + (config.port ? ':' + config.port : ''));
  const sameOrigin = (request) => request.headers.origin === config.origin
    || (localHost(request) && request.headers.origin === config.protocol + '//' + request.headers.host);


  async function api(request, response, url) {
    const path = url.pathname.slice('/api/v1'.length);
    const method = request.method;
    if (method !== 'GET') assert(sameOrigin(request), 'ORIGIN_REQUIRED', 403);
    const body = () => readJson(request, path.startsWith('/sync/') ? undefined : path.startsWith('/coach/') ? 96 * 1024 : 2048);
    if (path === '/session' && method === 'GET') {
      const device = devices.who(request, false);
      const origin = localHost(request) ? config.protocol + '//' + request.headers.host : config.origin;
      return json(response, { installation: store.installation, origin, timeZone, device: device ? devices.view(device) : null });
    }
    if (path === '/session/bootstrap' && method === 'POST') {
      const result = devices.bootstrap(request, await body());
      return json(response, result.device, 201, result.cookie);
    }
    if (path === '/pairings/claim' && method === 'POST') return json(response, devices.claim(request, await body()), 201);
    if (path === '/pairings/withdraw' && method === 'POST') {
      devices.withdraw(await body());
      return json(response, { ok: true });
    }
    if (path === '/pairings/exchange' && method === 'POST') {
      const result = devices.exchange(request, await body());
      return json(response, result.pending ? { pending: true } : { device: result.device }, 200, result.cookie);
    }
    if (path.startsWith('/coach/')) {
      const local = localHost(request);
      let device;
      if (!local) {
        try { device = devices.who(request); }
        catch (error) {
          if (error.code !== 'PAIR_REQUIRED') throw error;
          throw new ApiError(401, 'COACH_LOCAL_REQUIRED');
        }
      }
      const canManage = local || Boolean(device?.owner);
      if (path === '/coach/engines' && method === 'GET') return json(response, await coach.list(canManage));
      if (path === '/coach/providers' && method === 'GET') return json(response, await coach.providers());
      if (path === '/coach/engines/selection' && method === 'POST') {
        assert(canManage, 'OWNER_REQUIRED', 403);
        return json(response, await coach.choose(await body()));
      }
      if (path === '/coach/engines/codex-login') {
        assert(canManage, 'OWNER_REQUIRED', 403);
        if (method === 'GET') return json(response, coach.loginStatus());
        if (method === 'POST') {
          const input = await body();
          return json(response, coach.startLogin(!local || input.device === true));
        }
        if (method === 'DELETE') return json(response, coach.cancelLogin());
      }
      if (['/coach/test', '/coach/reviews', '/coach/plans'].includes(path) && method === 'POST') {
        const payload = await body();
        const controller = new AbortController();
        response.once('close', () => controller.abort());
        const kind = path.endsWith('/test') ? 'test' : path.endsWith('/plans') ? 'plan' : 'review';
        return json(response, await coach.run(kind, payload, controller.signal));
      }
      throw new ApiError(404, 'NOT_FOUND');
    }
    const device = devices.who(request);
    if (path === '/session' && method === 'DELETE') {
      store.run('UPDATE devices SET revokedAt=? WHERE id=?', Date.now(), device.id);
      return json(response, { ok: true }, 200, devices.cookie('', 0));
    }
    if (path === '/sync/summary' && method === 'GET') return json(response, store.summary());
    if (path === '/sync/changes' && method === 'GET') {
      const after = Number(url.searchParams.get('after') ?? '0');
      assert(Number.isSafeInteger(after) && after >= 0 && after <= 9_007_199_254_740_991);
      return json(response, store.feed(after));
    }
    if (path === '/sync/push' && method === 'POST') {
      const payload = await body();
      return json(response, store.push(devices.who(request), payload));
    }
    if (path.startsWith('/pairings') || path.startsWith('/devices')) assert(device.owner, 'OWNER_REQUIRED', 403);
    if (path === '/pairings' && method === 'POST') return json(response, devices.invite(), 201);
    const pairing = path.match(/^\/pairings\/([\w-]+)(\/approve)?$/);
    if (pairing) {
      const [, id, approve] = pairing;
      if (!approve && method === 'GET') return json(response, devices.status(id));
      if (!approve && method === 'DELETE') {
        store.run('DELETE FROM pairings WHERE id=?', id);
        return json(response, { ok: true });
      }
      if (approve && method === 'POST') {
        devices.approve(id);
        return json(response, { ok: true });
      }
    }
    if (path === '/devices' && method === 'GET') {
      return json(response, store.all('SELECT id, name, owner, createdAt, lastSeen FROM devices WHERE revokedAt IS NULL ORDER BY createdAt'));
    }
    const target = path.match(/^\/devices\/([\w-]+)$/);
    if (target && method === 'DELETE') {
      assert(target[1] !== device.id, 'USE_DISCONNECT');
      store.run('UPDATE devices SET revokedAt=? WHERE id=?', Date.now(), target[1]);
      return json(response, { ok: true });
    }
    throw new ApiError(404, 'NOT_FOUND');
  }

  async function serve(request, response, url) {
    assert(request.method === 'GET' || request.method === 'HEAD', 'METHOD_NOT_ALLOWED', 405);
    const pathname = decodeURIComponent(url.pathname);
    let filename = resolve(staticRoot, '.' + pathname);
    assert(filename.startsWith(staticRoot + sep) || filename === staticRoot, 'NOT_FOUND', 404);
    let info = await stat(filename).catch(() => null);
    if (!info?.isFile() && !extname(pathname)) {
      filename = resolve(staticRoot, 'index.html');
      info = await stat(filename).catch(() => null);
    }
    assert(info?.isFile(), 'NOT_FOUND', 404);
    response.writeHead(200, {
      'Content-Type': mime[extname(filename)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': filename.startsWith(resolve(staticRoot, 'assets') + sep) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (request.method === 'HEAD') return response.end();
    const stream = createReadStream(filename);
    stream.once('error', () => response.destroy());
    response.once('close', () => stream.destroy());
    stream.pipe(response);
  }
  async function handle(request, response) {
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    try {
      const url = new URL(request.url, config.origin);
      if (url.pathname.startsWith('/api/v1/')) await api(request, response, url);
      else if (url.pathname.startsWith('/api/')) throw new ApiError(404, 'NOT_FOUND');
      else await serve(request, response, url);
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      if (response.headersSent) return response.destroy();
      if (!(error instanceof ApiError)) {
        console.error('Forja: falha interna ao atender requisição.', error.code ?? error.name);
      }
      json(response, { error: error instanceof ApiError ? error.code : 'INTERNAL_ERROR' },
        error instanceof ApiError ? error.status : 500);
    }
  }

  const server = options.tls ? createTlsServer(options.tls, handle) : createServer(handle);
  server.requestTimeout = 30_000;
  server.once('close', () => { coach.cancelLogin(); store.close(); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const local = process.argv.includes('--local');
  const port = Number(process.env.FORJA_PORT ?? (local ? 5577 : 8787));
  const host = process.env.FORJA_HOST ?? '127.0.0.1';
  const origin = process.env.FORJA_URL ?? ('http://' + (local ? 'localhost:' : '127.0.0.1:') + port);
  const cert = process.env.FORJA_TLS_CERT;
  const key = process.env.FORJA_TLS_KEY;
  if (Boolean(cert) !== Boolean(key)) throw new Error('Configure FORJA_TLS_CERT e FORJA_TLS_KEY juntos.');
  createForjaServer({
    directory: process.env.FORJA_DATA_DIR, origin, timeZone: process.env.FORJA_TIME_ZONE, env: process.env,
    tls: cert && key ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined,
  }).listen(port, host, () => console.log(local
    ? 'Forja em ' + origin + '. Configure o Assistente em Perfil → Conexões de IA.'
    : 'Forja self-hosted em ' + origin + '. Chave de sync: pnpm self-host:admin.'));
}
