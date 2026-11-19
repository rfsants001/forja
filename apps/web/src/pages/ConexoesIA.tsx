import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, PlugZap } from 'lucide-react';
import { api, post, SyncError } from '../lib/sync-client';
import { useT } from '../lib/i18n';
import { syncMessage } from './Dispositivos';
import '../styles/self-host.css';

type EngineId = 'ollama' | 'codex-cli' | 'compatible';
interface Provider {
  id: EngineId; available: boolean; models: string[]; reason?: string;
}
interface Engines {
  active: { id: EngineId; model: string };
  providers: Provider[];
  canManage: boolean;
}
interface Login {
  status: 'idle' | 'pending' | 'connected' | 'failed';
  url?: string;
  code?: string;
  reason?: string;
}

export function ConexoesIA() {
  const t = useT();
  const [engines, setEngines] = useState<Engines>();
  const [login, setLogin] = useState<Login>();
  const [ollamaModel, setOllamaModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const loaded = await api<Engines>('/coach/engines');
    const list = loaded.providers.find(({ id }) => id === 'ollama')?.models ?? [];
    setEngines(loaded);
    setOllamaModel((current) => list.includes(current) ? current
      : loaded.active.id === 'ollama' && list.includes(loaded.active.model) ? loaded.active.model : list[0] ?? '');
    if (loaded.canManage) setLogin(await api<Login>('/coach/engines/codex-login'));
  }, []);

  function showError(failure: unknown) {
    setError(failure instanceof SyncError && failure.code === 'NO_SERVER' ? t('engines.startApp') : syncMessage(failure, t));
  }

  useEffect(() => { void refresh().catch(showError); }, [refresh, t]);
  useEffect(() => {
    if (login?.status !== 'pending') return;
    let active = true;
    const timer = window.setInterval(() => {
      void api<Login>('/coach/engines/codex-login').then((next) => {
        if (!active) return;
        setLogin(next);
        if (next.status === 'connected') void refresh().catch(showError);
      }).catch(() => {});
    }, 1200);
    return () => { active = false; window.clearInterval(timer); };
  }, [login?.status, refresh, t]);

  async function run(work: () => Promise<unknown>, message?: string) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await work();
      if (message) setNotice(t(message));
    } catch (failure) { showError(failure); }
    finally { setBusy(false); }
  }

  const ollama = engines?.providers.find(({ id }) => id === 'ollama');
  const codex = engines?.providers.find(({ id }) => id === 'codex-cli');
  const compatible = engines?.providers.find(({ id }) => id === 'compatible');
  const manage = engines?.canManage ?? false;
  const ollamaActive = engines?.active.id === 'ollama' && !!ollama?.models.length
    && (!engines.active.model || engines.active.model === ollamaModel);
  const codexActive = engines?.active.id === 'codex-cli' && codex?.available;
  async function activate(id: EngineId, model?: string) {
    await post('/coach/engines/selection', { id, model });
    await refresh();
  }

  return (
    <div className="coach-workspace">
      <header className="coach-page-header">
        <div><h1>{t('engines.title')}</h1><p className="hint">{t('engines.subtitle')}</p></div>
        <Link className="btn ghost" to="/perfil/assistente"><ArrowLeft size={16} aria-hidden />{t('coach.title')}</Link>
      </header>
      {error && <p className="feedback error" role="alert">{error}</p>}
      {notice && <p className="feedback" role="status">{notice}</p>}
      {engines && !manage && <p className="hint">{t('engines.ownerOnly')}</p>}
      <div className="engine-grid">
        <section className="card engine-card">
          <div className="engine-heading"><h2>Ollama</h2>{ollamaActive && <span>{t('engines.inUse')}</span>}</div>
          <p>{t('engines.ollamaPurpose')}</p>
          <p className="hint">{!ollama ? t('coach.checking') : !ollama.available ? t('engines.ollamaOffline')
            : !ollama.models.length ? t('coach.modelUnavailable') : t('engines.ollamaReady')}</p>
          {!!ollama?.models.length && (
            <label>{t('coach.model')}<select value={ollamaModel} disabled={!manage || busy} onChange={(event) => setOllamaModel(event.target.value)}>
              {ollama.models.map((model) => <option key={model}>{model}</option>)}
            </select></label>
          )}
          <div className="engine-actions">
            {!ollamaActive && !!ollamaModel && (
              <button className="btn" type="button" disabled={!manage || busy}
                onClick={() => void run(() => activate('ollama', ollamaModel), 'engines.saved')}>{t('engines.use')}</button>
            )}
            <button className="btn ghost" type="button" disabled={busy} onClick={() => void run(refresh)}>{t('engines.detect')}</button>
          </div>
        </section>

        <section className="card engine-card">
          <div className="engine-heading"><h2>Codex CLI</h2>{codexActive && <span>{t('engines.inUse')}</span>}</div>
          <p>{t('engines.codexPurpose')}</p>
          <p className="hint">{!codex ? t('coach.checking') : codex.available ? t('engines.codexReady')
            : t(codex.reason === 'CODEX_LOGIN_REQUIRED' ? 'engines.codexNeedsLogin' : 'coach.codexUnavailable')}</p>
          {login?.status === 'failed' && <p className="feedback error" role="status">{t(login.reason ? 'engines.loginFailed.' + login.reason : 'engines.loginFailed')}</p>}
          {login?.status === 'pending' ? (
            <div className="engine-login">
              <p role="status">{t(login.url ? 'engines.loginWaiting' : 'engines.loginStarting')}</p>
              {login.url && <a className="btn" href={login.url} target="_blank" rel="noreferrer">{t('engines.openChatGPT')} <ExternalLink size={15} aria-hidden /></a>}
              {login.code && <p>{t('engines.loginCode')} <code>{login.code}</code></p>}
              <button className="btn ghost" type="button" disabled={busy}
                onClick={() => void run(async () => { setLogin(await api<Login>('/coach/engines/codex-login', { method: 'DELETE' })); })}>
                {t('tg.cancel')}
              </button>
            </div>
          ) : (
            <div className="engine-actions">
              {codex?.available ? (!codexActive && <button className="btn" type="button" disabled={!manage || busy}
                onClick={() => void run(() => activate('codex-cli', codex.models[0]), 'engines.saved')}>{t('engines.use')}</button>)
                : <>
                  <button className="btn" type="button" disabled={!manage || busy || codex?.reason !== 'CODEX_LOGIN_REQUIRED'}
                    onClick={() => void run(async () => { setLogin(await post<Login>('/coach/engines/codex-login', { device: false })); })}>
                    <PlugZap size={16} aria-hidden />{t('engines.connectCodex')}
                  </button>
                  {codex?.reason === 'CODEX_CLI_MISSING' && <a className="engine-policy"
                    href="https://learn.chatgpt.com/docs/cli" target="_blank" rel="noreferrer">{t('engines.installCodex')}</a>}
                  {manage && !codex?.available && <button className="btn ghost" type="button" disabled={busy}
                    onClick={() => void run(refresh)}>{t('engines.refreshCodex')}</button>}
                  {manage && codex?.reason === 'CODEX_LOGIN_REQUIRED' && <button className="btn ghost" type="button" disabled={busy}
                    onClick={() => void run(async () => { setLogin(await post<Login>('/coach/engines/codex-login', { device: true })); })}>
                    {t('engines.connectWithCode')}
                  </button>}
                </>}
            </div>
          )}
        </section>

        <section className="card engine-card">
          <div className="engine-heading"><h2>{t('engines.compatTitle')}</h2>
            {engines?.active.id === 'compatible' && <span>{t('engines.inUse')}</span>}</div>
          <p>{t('engines.compatDescription')}</p>
          <p className="hint">{compatible?.available ? compatible.models[0] : t('engines.compatSetup')}</p>
          {compatible?.available && engines?.active.id !== 'compatible' && <button className="btn" type="button"
            disabled={!manage || busy} onClick={() => void run(() => activate('compatible', compatible.models[0]), 'engines.saved')}>
            {t('engines.use')}</button>}
        </section>
        <section className="card engine-card">
          <div className="engine-heading"><h2>Claude Code</h2></div>
          <p>{t('engines.claudeUnavailable')}</p>
          <a className="engine-policy" href="https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use"
            target="_blank" rel="noreferrer">{t('engines.claudePolicy')} <ExternalLink size={14} aria-hidden /></a>
        </section>
      </div>
    </div>
  );
}
