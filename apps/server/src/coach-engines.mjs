import { createCoach } from './coach.mjs';
import { codexFromEnv, compatibleFromEnv, resolveProvider } from './providers/index.mjs';
import { ollamaProvider } from './providers/ollama.mjs';
import { assert } from './storage.mjs';

const preferenceKey = 'coach-engine';
const officialDevicePage = 'https://auth.openai.com/codex/device';

function challengeFor(output, device) {
  if (device) {
    const code = output.match(/\b[A-Z0-9]{4,6}-[A-Z0-9]{4,6}\b/)?.[0];
    return output.includes(officialDevicePage) && code ? { url: officialDevicePage, code } : {};
  }
  const raw = output.match(/https:\/\/auth\.openai\.com\/oauth\/authorize\?[^\s<>"']+/)?.[0];
  if (!raw) return {};
  const url = new URL(raw);
  const redirect = url.searchParams.get('redirect_uri');
  return redirect && /^http:\/\/(localhost|127\.0\.0\.1):1455\/auth\/callback$/.test(redirect)
    ? { url: url.href } : {};
}

export function createCoachEngines(store, { env = {}, ollama, coachProvider } = {}) {
  const configured = coachProvider ?? resolveProvider(env, ollama);
  const codex = configured.id === 'codex-cli' ? configured : codexFromEnv(env);
  const ollamaEngine = configured.id === 'ollama' ? configured : ollamaProvider(ollama ?? env.FORJA_OLLAMA_URL ?? 'http://127.0.0.1:11434');
  const compatible = configured.id === 'compatible' ? configured : compatibleFromEnv(env);
  const engines = new Map([['ollama', createCoach(ollamaEngine)], ['codex-cli', createCoach(codex)], ['compatible', createCoach(compatible)]]);
  let login;
  let running = false;

  function selection() {
    const raw = store.get('SELECT value FROM config WHERE key=?', preferenceKey)?.value;
    return raw ? JSON.parse(raw) : { id: configured.id, model: '' };
  }

  async function list(canManage) {
    const active = selection();
    const providers = await Promise.all([...engines.values()].map((coach) => coach.providers()));
    return { active, providers, canManage };
  }

  async function choose(body) {
    const coach = engines.get(body.id);
    assert(coach, 'ENGINE_UNKNOWN', 400);
    const provider = await coach.providers();
    assert(provider.available, provider.reason ?? 'PROVIDER_UNAVAILABLE', 503);
    const model = body.model ?? provider.models[0];
    assert(provider.models.includes(model), 'MODEL_UNAVAILABLE', 422);
    store.run('INSERT OR REPLACE INTO config VALUES (?,?)', preferenceKey, JSON.stringify({ id: body.id, model }));
    return selection();
  }

  function loginStatus() {
    if (!login) return { status: 'idle' };
    const { status, url, code, reason } = login;
    return { status, url, code, reason };
  }

  function startLogin(device) {
    if (login?.status === 'pending') return loginStatus();
    const current = { status: 'pending', controller: new AbortController() };
    login = current;
    let output = '';
    void Promise.resolve().then(() => codex.login({
      device, signal: current.controller.signal,
      onOutput: (chunk) => {
        if (current.status !== 'pending') return;
        output = (output + chunk).slice(-16_384);
        const plain = output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
        const challenge = challengeFor(plain.slice(0, plain.lastIndexOf('\n') + 1), device);
        if (challenge.url) Object.assign(current, challenge);
      },
    })).then(() => { if (current.status === 'pending') current.status = 'connected'; })
      .catch((error) => {
        if (current.status !== 'pending') return;
        current.status = 'failed';
        const diagnostic = output + String(error?.stderr ?? '');
        if (error?.code === 'CODEX_CLI_MISSING') current.reason = 'missing';
        else if (/error sending request|token.exchange.failed|certificate|unknown issuer|timed out/i.test(diagnostic)) current.reason = 'network';
        else if (/address already in use|EADDRINUSE|failed to bind|os error 10048|os error 10013/i.test(diagnostic)) current.reason = 'callback';
        else if (device) current.reason = 'device';
      })
      .finally(() => { current.url = undefined; current.code = undefined; });
    return loginStatus();
  }

  function cancelLogin() {
    const current = login;
    login = undefined;
    if (current) {
      current.status = 'canceled';
      current.controller.abort();
    }
    return loginStatus();
  }

  async function providers() {
    const active = selection();
    return { ...await engines.get(active.id).providers(), selectedModel: active.model };
  }

  async function run(kind, body, signal) {
    const active = selection();
    assert(!body.provider || body.provider === active.id, 'ENGINE_CHANGED', 409);
    assert(!running, 'PROVIDER_BUSY', 429);
    running = true;
    try { return await engines.get(active.id)[kind](body, signal); }
    finally { running = false; }
  }

  return { list, choose, providers, run, loginStatus, startLogin, cancelLogin };
}
