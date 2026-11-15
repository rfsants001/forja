import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import qr from 'qrcode-generator';
import { assert } from './storage.mjs';

const lifetime = 5 * 60 * 1000;

export function adminKey(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, 'admin-key');
  try {
    writeFileSync(file, randomBytes(32).toString('hex') + '\n', { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  chmodSync(file, 0o600);
  const key = readFileSync(file, 'utf8').trim();
  assert(/^[a-f0-9]{64}$/.test(key), 'INVALID_ADMIN_KEY', 500);
  return key;
}

export function createDeviceService(store, origin, key) {
  const secretDigest = (namespace, secret) => createHmac('sha256', key).update(namespace).update(':').update(secret).digest('hex');
  const token = () => randomBytes(24).toString('base64url');
  const constantEqual = (first, second) => timingSafeEqual(
    Buffer.from(secretDigest('compare', first)), Buffer.from(secretDigest('compare', second)),
  );
  const secure = new URL(origin).protocol === 'https:';
  const cookieName = secure ? '__Host-forja' : 'forja';
  function cookie(raw, maxAge = 60 * 60 * 24 * 365) {
    return cookieName + '=' + raw + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (secure ? '; Secure' : '');
  }

  function who(request, required = true) {
    const prefix = cookieName + '=';
    const raw = (request.headers.cookie ?? '').split(';').map((part) => part.trim())
      .find((part) => part.startsWith(prefix))?.slice(prefix.length);
    if (!raw) {
      assert(!required, 'PAIR_REQUIRED', 401);
      return null;
    }
    const device = store.get('SELECT * FROM devices WHERE secret=?', secretDigest('session', raw));
    if (!device || device.revokedAt !== null) {
      assert(!required, 'DEVICE_REVOKED', 401);
      return null;
    }
    if (Date.now() - device.lastSeen > 60_000) store.run('UPDATE devices SET lastSeen=? WHERE id=?', Date.now(), device.id);
    return device;
  }

  function name(value) {
    assert(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80
      && !/[\u0000-\u001f]/.test(value));
    return value.trim();
  }
  function addDevice(label, owner, raw) {
    const id = randomUUID();
    const now = Date.now();
    store.run('INSERT INTO devices(id,name,owner,secret,createdAt,lastSeen) VALUES (?,?,?,?,?,?)',
      id, label, owner ? 1 : 0, secretDigest('session', raw), now, now);
    return id;
  }

  function view(device) {
    return { id: device.id, name: device.name, owner: Boolean(device.owner) };
  }

  const attempts = new Map();
  function rateLimit(request, kind, limit) {
    const now = Date.now();
    for (const [id, data] of attempts) if (data.until <= now) attempts.delete(id);
    const source = request.socket.remoteAddress ?? 'unknown';
    const id = kind + '/' + source;
    const current = attempts.get(id) ?? { count: 0, until: now + lifetime };
    assert(current.count < limit && attempts.size < 10_000, 'TOO_MANY_ATTEMPTS', 429);
    current.count++;
    attempts.set(id, current);
  }

  function bootstrap(request, body) {
    rateLimit(request, 'bootstrap', 12);
    assert(typeof body.key === 'string' && constantEqual(body.key, key), 'ADMIN_KEY_INVALID', 401);
    const raw = token();
    const label = name(body.name);
    const id = addDevice(label, true, raw);
    return { cookie: cookie(raw), device: { id, name: label, owner: true } };
  }
  function invite() {
    const id = randomUUID();
    const code = String(randomInt(1_000_000)).padStart(6, '0');
    const qrSecret = token();
    const expires = Date.now() + lifetime;
    const url = origin + '/conectar#pair=' + qrSecret;
    const marker = qr(0, 'M');
    marker.addData(url);
    marker.make();
    store.transaction(() => {
      store.run('DELETE FROM pairings');
      store.run('INSERT INTO pairings(id,code,qr,expires) VALUES (?,?,?,?)',
        id, secretDigest('code', id + ':' + code), secretDigest('qr', qrSecret), expires);
    });
    const grid = marker.getModuleCount();
    const modules = [];
    for (let row = 0; row < grid; row++) {
      for (let col = 0; col < grid; col++) if (marker.isDark(row, col)) modules.push('M' + col + ' ' + row + 'h1v1h-1z');
    }
    const width = grid + 8;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ' + width + ' ' + width
      + '" shape-rendering="crispEdges"><rect x="-4" y="-4" width="' + width + '" height="' + width
      + '" fill="white"/><path fill="black" d="' + modules.join('') + '"/></svg>';
    return { id, expires, code, url, qr: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') };
  }
  function active(id) {
    const invite = id ? store.get('SELECT * FROM pairings WHERE id=?', id) : store.get('SELECT * FROM pairings LIMIT 1');
    assert(invite && invite.expires > Date.now() && invite.failures < 5, 'PAIRING_EXPIRED', 410);
    return invite;
  }
  function claim(request, body) {
    rateLimit(request, 'claim', 15);
    const label = name(body.name);
    const invite = active();
    const manual = typeof body.code === 'string' && /^[0-9]{6}$/.test(body.code);
    const manualMatches = manual && constantEqual(invite.code, secretDigest('code', invite.id + ':' + body.code));
    const qrMatches = typeof body.token === 'string' && constantEqual(invite.qr, secretDigest('qr', body.token));
    if (!manualMatches && !qrMatches) {
      // Record failures before throwing so a bad request cannot roll back the counter.
      store.run('UPDATE pairings SET failures=failures+1 WHERE id=?', invite.id);
      assert(false, 'PAIRING_INVALID', 400);
    }
    assert(invite.proof === null, 'PAIRING_CLAIMED', 409);
    const proof = token();
    store.run('UPDATE pairings SET proof=?, name=? WHERE id=?', secretDigest('proof', proof), label, invite.id);
    return { id: invite.id, expires: invite.expires, proof };
  }
  function status(id) {
    const { name, approved, deviceId, expires } = active(id);
    return { name, approved: Boolean(approved), linked: deviceId !== null, expires };
  }
  function approve(id) {
    const invite = active(id);
    assert(invite.proof && invite.approved === 0, 'PAIRING_NOT_PENDING', 409);
    store.run('UPDATE pairings SET approved=1 WHERE id=?', id);
  }
  function withdraw(body) {
    const invite = active(body.id);
    assert(typeof body.proof === 'string' && invite.proof
      && constantEqual(invite.proof, secretDigest('proof', body.proof)), 'PAIRING_INVALID', 401);
    assert(invite.deviceId === null, 'PAIRING_ALREADY_LINKED', 409);
    store.run('DELETE FROM pairings WHERE id=?', invite.id);
  }
  function exchange(request, body) {
    rateLimit(request, 'exchange', 300);
    assert(typeof body.id === 'string' && typeof body.proof === 'string');
    const invite = active(body.id);
    assert(invite.proof && constantEqual(invite.proof, secretDigest('proof', body.proof)), 'PAIRING_INVALID', 401);
    if (!invite.approved) return { pending: true };
    const raw = secretDigest('exchange', invite.id + ':' + body.proof);
    return store.transaction(() => {
      const id = invite.deviceId ?? addDevice(invite.name, false, raw);
      if (!invite.deviceId) store.run('UPDATE pairings SET deviceId=? WHERE id=?', id, invite.id);
      const device = store.get('SELECT * FROM devices WHERE id=?', id);
      assert(device.revokedAt === null, 'DEVICE_REVOKED', 401);
      return { cookie: cookie(raw), device: view(device) };
    });
  }

  return { who, view, bootstrap, invite, claim, status, approve, withdraw, exchange, cookie };
}
