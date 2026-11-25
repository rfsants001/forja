import { useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { db } from '../db/db';
import { useT } from '../lib/i18n';
import { canPromptInstall, installApp, offlineSnapshot, protectStorage, repairOffline, subscribeOffline } from '../lib/offline';
import { sessionStorageFailed, subscribeSessionStorage } from '../lib/session-storage';
import '../styles/offline.css';

export function OfflinePanel({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const status = useSyncExternalStore(subscribeOffline, offlineSnapshot);
  const draftFailed = useSyncExternalStore(subscribeSessionStorage, sessionStorageFailed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plan = useLiveQuery(async () => {
    const routines = (await db.routines.toArray()).filter(({ exercises }) => exercises.length);
    const ids = [...new Set(routines.flatMap(({ exercises }) => exercises.map(({ exerciseId }) => exerciseId)))];
    const definitions = await db.exercises.bulkGet(ids);
    return { count: routines.length, valid: routines.length > 0 && definitions.every(Boolean) };
  }, []);
  const ready = status.phase === 'ready' && status.storage === 'available' && !draftFailed && plan?.valid;
  const text = draftFailed || status.storage === 'blocked' ? 'offline.storageBlocked'
    : status.phase !== 'ready' ? 'offline.phase.' + status.phase
    : plan === undefined ? 'offline.checkingPlan' : !plan.valid ? 'offline.planMissing' : 'offline.ready';
  async function run(work: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await work(); } catch { setError(t('offline.actionFailed')); }
    finally { setBusy(false); }
  }
  return <section className={'offline-panel' + (compact ? ' compact' : '')} aria-labelledby={compact ? 'offline-home' : 'offline-profile'}>
    <header><div><h2 id={compact ? 'offline-home' : 'offline-profile'}>{t('offline.title')}</h2>
      <p role="status" className={ready ? 'offline-ready' : ''}>{ready ? <CheckCircle2 size={16} aria-hidden /> : <Circle size={16} aria-hidden />}{t(text)}</p>
    </div>{compact && <Link className="btn ghost" to="/perfil#profile-offline">{t('offline.details')}</Link>}</header>
    {!compact && <>
      <p className="hint">{t('offline.help')}</p>
      <ul className="offline-checklist">
        <li><span>{t('offline.appResources')}</span><strong>{t(status.phase === 'ready' ? 'offline.available' : 'offline.notVerified')}</strong></li>
        <li><span>{t('offline.savedPlan')}</span><strong>{t(plan?.valid ? 'offline.available' : 'offline.planMissingShort')}</strong></li>
      </ul>
      <div className="form-actions">
        <button className="btn ghost" type="button" disabled={busy} onClick={() => void run(repairOffline)}><RefreshCw size={15} aria-hidden />{t('offline.check')}</button>
        {status.persistent !== 'granted' && <button className="btn ghost" type="button" disabled={busy} onClick={() => void run(protectStorage)}>
          <ShieldCheck size={15} aria-hidden />{t('offline.protect')}</button>}
        <button className="btn ghost" type="button" disabled={busy} onClick={() => void run(async () => {
          const { downloadBackup } = await import('../lib/backup'); await downloadBackup();
        })}><Download size={15} aria-hidden />{t('offline.backup')}</button>
      </div>
      <p className="hint">{t('offline.persistence.' + status.persistent)}</p>
      <details className="offline-install"><summary>{t(status.installed ? 'offline.installed' : 'offline.installTitle')}</summary>
        {canPromptInstall() && <button className="btn" type="button" disabled={busy} onClick={() => void run(installApp)}>{t('offline.install')}</button>}
        <p>{t('offline.installAndroid')}</p><p>{t('offline.installIos')}</p><p>{t('offline.installDesktop')}</p>
      </details>
      {!plan?.valid && <Link className="btn ghost" to="/treinos">{t('offline.choosePlan')}</Link>}
      <p className="hint">{t('offline.limits')}</p>
      <Link className="offline-device-link" to="/perfil/dispositivos">{t('offline.manageSync')}</Link>
      {error && <p className="feedback error" role="alert">{error}</p>}
    </>}
  </section>;
}
