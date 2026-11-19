import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { Laptop, Link2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { db } from '../db/db';
import { api, enableSync, forgetSync, getLocalCounts, post, requiresCopy, resolveConflict, sessionInfo,
  subscribeSync, syncNow, syncRuntime, SyncError } from '../lib/sync-client';
import type { SyncCounts, SyncDevice, SyncSession } from '../lib/sync-protocol';
import { useT } from '../lib/i18n';
import '../styles/self-host.css';

const errors: Record<string, string> = {
  NO_SERVER: 'sync.noServer', OFFLINE: 'sync.offline', DEVICE_REVOKED: 'sync.revoked',
  ADMIN_KEY_INVALID: 'sync.invalidKey', PAIR_REQUIRED: 'sync.pairRequired', PAIRING_EXPIRED: 'sync.expired',
  PAIRING_INVALID: 'sync.invalidCode', PAIRING_CLAIMED: 'sync.claimed', TOO_MANY_ATTEMPTS: 'sync.rateLimit',
  INSTALLATION_CHANGED: 'sync.installationChanged', CONFLICT_REQUIRES_COPY: 'sync.requiresCopy',
  PAYLOAD_TOO_LARGE: 'sync.payload', UPDATE_REQUIRED: 'sync.updateRequired', PROVIDER_UNAVAILABLE: 'coach.providerError',
  COACH_LOCAL_REQUIRED: 'engines.localOnly', ENGINE_CHANGED: 'engines.changed',
  INVALID_PROVIDER_RESPONSE: 'coach.invalidResponse', WEEK_VARIATION_UNAVAILABLE: 'coach.weekUnavailable', CODEX_LOGIN_REQUIRED: 'coach.codexLoginRequired',
  MODEL_UNAVAILABLE: 'coach.modelMissing', PROVIDER_BUSY: 'coach.busy', CURSOR_RESET: 'sync.cursorReset',
};
export function syncMessage(error: unknown, t: ReturnType<typeof useT>) {
  return t((error instanceof SyncError && errors[error.code]) || 'sync.error');
}

const records = ['routines', 'weekPlan', 'dayOverrides', 'categories', 'exercises', 'workouts'] as const;
interface Invite { id: string; code: string; qr: string; url: string; expires: number }
interface InviteStatus { name: string | null; approved: boolean; linked: boolean }
type DeviceRow = SyncDevice & { lastSeen: number };

export function Dispositivos() {
  const t = useT();
  const [session, setSession] = useState<SyncSession>();
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [roster, setRoster] = useState<DeviceRow[]>([]);
  const [invite, setInvite] = useState<Invite>();
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>();
  const [preview, setPreview] = useState<{ local: SyncCounts; remote: SyncCounts }>();
  const state = useLiveQuery(() => db.syncState.get('installation'), []);
  const queue = useLiveQuery(() => db.syncOutbox.toArray(), []);
  const first = queue?.[0];
  const runtime = useSyncExternalStore(subscribeSync, syncRuntime);
  const attached = !!state && state.installation === session?.installation && !!session.device;

  async function refresh() {
    const info = await sessionInfo();
    setSession(info);
    setRoster(info.device?.owner ? await api<DeviceRow[]>('/devices') : []);
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setIssue('');
    setNotice('');
    try { await work(); } catch (error) { setIssue(syncMessage(error, t)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    void run(async () => {
      await refresh();
      void syncNow();
    });
  }, []);

  useEffect(() => {
    if (!invite) return;
    let active = true;
    const read = async () => {
      try {
        const next = await api<InviteStatus>('/pairings/' + invite.id);
        if (!active) return;
        setInviteStatus(next);
        if (next.linked) void refresh().catch(() => {});
      } catch (error) {
        if (!active) return;
        setIssue(syncMessage(error, t));
        if (error instanceof SyncError && error.code === 'PAIRING_EXPIRED') setInvite(undefined);
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [invite, t]);

  async function newInvite() {
    setInviteStatus(undefined);
    setInvite(await post<Invite>('/pairings'));
  }
  const copyable = !!first?.conflicts?.some((conflict) => conflict.kind === 'routines' && requiresCopy(conflict));
  const keepDisabled = first?.reason === 'INVALID_REFERENCE'
    || first?.conflicts?.some((conflict) => requiresCopy(conflict) && first.mutations.some(
      (change) => change.kind === conflict.kind && change.key === conflict.key && change.value !== null,
    ));

  return (
    <>
      <header className="topbar"><div className="brand"><span className="mark"><Laptop size={20} aria-hidden="true" /></span><h1>{t('sync.devices')}</h1></div></header>
      <div className="self-host-layout">
        <section className="card self-host-card">
          <h2>{t('sync.installation')}</h2>
          <p className="hint">{session?.origin ?? location.origin}</p>
          <p role="status">
            {t(state && runtime.status !== 'idle' ? 'sync.state.' + runtime.status : 'sync.state.idle')}
            {' · '}{t('sync.pending', [queue?.length ?? 0])}
          </p>
          {state && <p className="hint">{state.lastSync
            ? t('sync.lastSync', [new Date(state.lastSync).toLocaleString(document.documentElement.lang)]) : t('sync.never')}</p>}
          {runtime.error && state && <p className="hint">{syncMessage(new SyncError(runtime.error), t)}</p>}
          {issue && <p className="feedback error" role="alert">{issue}</p>}
          {notice && <p className="feedback" role="status">{notice}</p>}
          {session && !session.device && (
            <>
              <Link className="btn ghost" to="/conectar">{t('sync.join')}</Link>
              <details className="self-host-owner">
                <summary>{t('sync.ownerLogin')}</summary>
                <form onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  void run(async () => {
                    await post('/session/bootstrap', { key, name });
                    setKey('');
                    await refresh();
                  });
                }}>
                  <label>{t('sync.deviceName')}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required /></label>
                  <label>{t('sync.ownerKey')}<input type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} required /></label>
                  <button className="btn" disabled={busy}>{t('sync.ownerLogin')}</button>
                </form>
              </details>
            </>
          )}
          {session?.device && !attached && !state && (
            <>
              <p className="hint">{t('sync.scope')}</p>
              {!preview ? <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => {
                const [local, remote] = await Promise.all([getLocalCounts(), api<SyncCounts>('/sync/summary')]);
                setPreview({ local, remote });
              })}>{t('sync.preview')}</button> : (
                <div className="self-host-card">
                  <table className="self-host-table">
                    <thead><tr><th scope="col">{t('sync.data')}</th><th scope="col">{t('sync.thisDevice')}</th><th scope="col">{t('sync.installation')}</th></tr></thead>
                    <tbody>{records.map((kind) => <tr key={kind}><th scope="row">{t('sync.kind.' + kind)}</th>
                      <td>{preview.local[kind] ?? 0}</td><td>{preview.remote[kind] ?? 0}</td></tr>)}</tbody>
                  </table>
                  <p className="hint">{t('sync.merge')}</p>
                  <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => {
                    await enableSync(session);
                    setPreview(undefined);
                  })}>{t('sync.enable')}</button>
                </div>
              )}
            </>
          )}
          {session?.device && state && state.installation !== session.installation && <p className="feedback error">{t('sync.installationChanged')}</p>}
          {attached && <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(async () => {
            await syncNow();
            await refresh();
          })}>{t('sync.run')}</button>}
          {(!!state || !!session?.device) && (
            <div className="self-host-actions">
              <Link className="btn ghost" to="/perfil">{t('sync.backup')}</Link>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => {
                if (!confirm(t('sync.detachConfirm'))) return;
                void run(async () => {
                  if (session?.device) await api('/session', { method: 'DELETE' });
                  await forgetSync();
                  setPreview(undefined);
                  setInvite(undefined);
                  setSession(session ? { ...session, device: null } : undefined);
                  setRoster([]);
                });
              }}>{t('sync.detach')}</button>
            </div>
          )}
        </section>

        {session?.device?.owner && (
          <section className="card self-host-card">
            <h2>{t('sync.pairDevice')}</h2>
            <ul className="self-host-list">{roster.map((device) => (
              <li key={device.id}>
                <div><strong>{device.name}</strong><p className="hint">{device.id === session.device?.id ? t('sync.thisDevice')
                  : t('sync.lastSeen', [new Date(device.lastSeen).toLocaleString(document.documentElement.lang)])}</p></div>
                {device.id !== session.device?.id && <button type="button" className="btn ghost" disabled={busy}
                  onClick={() => { if (confirm(t('sync.revokeConfirm', [device.name]))) void run(async () => {
                    await api('/devices/' + device.id, { method: 'DELETE' });
                    await refresh();
                  }); }}>{t('sync.revoke')}</button>}
              </li>
            ))}</ul>
            <button type="button" className="btn" disabled={busy} onClick={() => void run(newInvite)}>
              {t(invite ? 'sync.newCode' : 'sync.pairDevice')}
            </button>
            {invite && (
              <div className="self-host-card">
                <img className="sync-qr" width="168" height="168" alt={t('sync.qrAlt')} src={invite.qr} />
                <p className="sync-code">{invite.code.replace(/(\d{3})(\d{3})/, '$1 $2')}</p>
                <p className="hint">{t('sync.openAddress', [session.origin + '/conectar'])}</p>
                <p className="hint">{t('sync.expires', [new Date(invite.expires).toLocaleTimeString(document.documentElement.lang)])}</p>
                <div className="self-host-actions">
                  <button type="button" className="btn ghost" onClick={() => void run(async () => {
                    await navigator.clipboard.writeText(invite.code);
                    setNotice(t('sync.copied'));
                  })}>{t('sync.copyCode')}</button>
                  <button type="button" className="btn ghost" onClick={() => void run(async () => {
                    await navigator.clipboard.writeText(session.origin + '/conectar');
                    setNotice(t('sync.addressCopied'));
                  })}>{t('sync.copyAddress')}</button>
                  <button type="button" className="btn ghost" onClick={() => void run(async () => {
                    await api('/pairings/' + invite.id, { method: 'DELETE' });
                    setInvite(undefined);
                  })}>{t('sync.cancelInvite')}</button>
                </div>
                {inviteStatus?.name && <p role="status">{t(inviteStatus.approved ? 'sync.approved' : 'sync.requested', [inviteStatus.name])}</p>}
                {inviteStatus?.name && !inviteStatus.approved && (
                  <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => {
                    await post('/pairings/' + invite.id + '/approve');
                    setInviteStatus({ ...inviteStatus, approved: true });
                  })}>{t('sync.approve')}</button>
                )}
              </div>
            )}
          </section>
        )}

        {first?.conflicts && first.seq !== undefined && (
          <section className="card self-host-card">
            <h2>{t('sync.state.conflict')}</h2>
            <p className="hint">{t(first.reason === 'INVALID_REFERENCE' ? 'sync.referenceConflict' : 'sync.conflictHelp')}</p>
            {first.conflicts.map((conflict) => {
              const local = first.mutations.find((change) => change.kind === conflict.kind && change.key === conflict.key);
              const label = local?.value && 'name' in local.value ? local.value.name : conflict.key;
              return <details key={conflict.kind + conflict.key}><summary>{t('sync.kind.' + conflict.kind)} · {label}</summary>
                <div className="sync-versions">
                  <div><h3>{t('sync.thisDevice')}</h3><pre>{local?.value ? JSON.stringify(local.value, null, 2) : t('sync.removed')}</pre></div>
                  <div><h3>{t('sync.installation')}</h3><pre>{conflict.value ? JSON.stringify(conflict.value, null, 2) : t('sync.removed')}</pre></div>
                </div>
              </details>;
            })}
            <div className="self-host-actions">
              <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(() => resolveConflict(first.seq!, 'remote'))}>{t('sync.useRemote')}</button>
              <button type="button" className="btn ghost" disabled={busy || keepDisabled} onClick={() => void run(() => resolveConflict(first.seq!, 'local'))}>{t('sync.keepLocal')}</button>
              {copyable && <button type="button" className="btn ghost" disabled={busy}
                onClick={() => void run(() => resolveConflict(first.seq!, 'copy'))}>{t('sync.saveCopy')}</button>}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

interface Claim { id: string; expires: number; proof: string }
export function Conectar() {
  const t = useT();
  const navigate = useNavigate();
  const [info, setInfo] = useState<SyncSession>();
  const [token, setToken] = useState(() => new URLSearchParams(location.hash.slice(1)).get('pair') ?? '');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [issue, setIssue] = useState('');
  const [claim, setClaim] = useState<Claim>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token && location.hash) history.replaceState(history.state, '', location.pathname + location.search);
    void sessionInfo().then(setInfo).catch((error: unknown) => setIssue(syncMessage(error, t)));
  }, []);

  useEffect(() => {
    if (!claim) return;
    let active = true;
    const read = async () => {
      try {
        const next = await post<{ pending?: boolean; device?: SyncDevice }>('/pairings/exchange', claim);
        if (active && next.device) navigate('/perfil/dispositivos', { replace: true });
      } catch (error) {
        if (!active) return;
        setIssue(syncMessage(error, t));
        if (error instanceof SyncError && error.code !== 'OFFLINE') setClaim(undefined);
      }
    };
    const timer = window.setInterval(() => void read(), 1800);
    return () => { active = false; window.clearInterval(timer); };
  }, [claim, navigate, t]);

  return (
    <>
      <header className="topbar"><div className="brand"><span className="mark"><Link2 size={20} aria-hidden="true" /></span><h1>{t('sync.join')}</h1></div></header>
      <section className="card self-host-card self-host-single">
        <p>{t('sync.openAddress', [info?.origin ?? location.origin])}</p>
        <p className="hint">{t('sync.scope')}</p>
        {issue && <p className="feedback error" role="alert">{issue}</p>}
        {claim ? (
          <>
            <p role="status">{t('sync.waitingApproval')}</p>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => {
              setBusy(true);
              void post('/pairings/withdraw', claim).then(() => setClaim(undefined))
                .catch((error: unknown) => setIssue(syncMessage(error, t))).finally(() => setBusy(false));
            }}>{t('sync.stopWaiting')}</button>
          </>
        ) : (
          <form onSubmit={(event) => {
            event.preventDefault();
            setIssue('');
            setBusy(true);
            void post<Claim>('/pairings/claim', { name, ...(token ? { token } : { code: code.replace(/\s/g, '') }) })
              .then(setClaim).catch((error: unknown) => setIssue(syncMessage(error, t))).finally(() => setBusy(false));
          }}>
            <label>{t('sync.deviceName')}<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
            {token ? <button type="button" className="btn ghost" onClick={() => setToken('')}>{t('sync.useCode')}</button>
              : <label>{t('sync.code')}<input required inputMode="numeric" autoComplete="off" pattern="[0-9 ]{6,7}" maxLength={7}
                  value={code} onChange={(event) => setCode(event.target.value)} /></label>}
            <button className="btn" disabled={busy || !info}>{t('sync.claim')}</button>
          </form>
        )}
        <Link to="/" className="btn ghost">{t('sync.local')}</Link>
      </section>
    </>
  );
}
