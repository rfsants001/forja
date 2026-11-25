import { useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { CloudOff, RefreshCw } from 'lucide-react';
import { db } from '../db/db';
import { useT } from '../lib/i18n';
import { useSessionStore, retrySessionStorage } from '../store/session';
import { reportSessionStorage, sessionStorageFailed, subscribeSessionStorage } from '../lib/session-storage';
import { applyAppUpdate, offlineSnapshot, subscribeOffline } from '../lib/offline';
import { subscribeSync, syncRuntime } from '../lib/sync-client';
import { transferState } from '../lib/offline-policy';
import '../styles/offline.css';

export function useTransferStatus() {
  const linked = useLiveQuery(() => db.syncState.get('installation'), []);
  const queue = useLiveQuery(() => db.syncOutbox.toArray(), []);
  const runtime = useSyncExternalStore(subscribeSync, syncRuntime);
  const pending = queue?.reduce((total, item) => total + item.mutations.length, 0) ?? 0;
  const conflict = !!queue?.some((item) => item.conflicts?.length);
  return { kind: transferState(!!linked, pending, conflict, runtime.status, linked?.lastSync), pending };
}

export function AppStatus() {
  const t = useT();
  const offline = useSyncExternalStore(subscribeOffline, offlineSnapshot);
  const failed = useSyncExternalStore(subscribeSessionStorage, sessionStorageFailed);
  const active = useSessionStore((state) => state.active);
  const transfer = useTransferStatus();
  const [updateMessage, setUpdateMessage] = useState('');
  return <div className="app-status">
    {failed && <div className="app-status-warning" role="alert"><p>{t('offline.draftFailed')}</p>
      <button className="btn ghost" type="button" onClick={() => { void retrySessionStorage().catch(() => reportSessionStorage(true)); }}>{t('offline.retrySave')}</button></div>}
    {!offline.online && <p className="app-status-line" role="status"><CloudOff size={16} aria-hidden />{t('offline.networkOff')}
      <Link to="/perfil#profile-offline">{t('offline.details')}</Link></p>}
    {(transfer.kind === 'pending' || transfer.kind === 'waiting' || transfer.kind === 'conflict') && <p className="app-status-line" role="status">
      {t('offline.transfer.' + transfer.kind, [transfer.pending])}<Link to="/perfil/dispositivos">{t('offline.viewSync')}</Link></p>}
    {offline.updateAvailable && <div className="app-status-update" role="status"><div><strong>{t('offline.updateTitle')}</strong>
      <p>{t(active ? 'offline.updateAfterWorkout' : 'offline.updateHelp')}</p>{updateMessage && <p>{updateMessage}</p>}</div>
      <button className="btn ghost" type="button" disabled={!!active || failed} onClick={() => {
        if (useSessionStore.getState().active || document.querySelector('dialog[open]') || /\/treinos\/rotina\//.test(location.pathname)) {
          setUpdateMessage(t('offline.updateBlocked')); return;
        }
        void applyAppUpdate().then((applied) => { if (!applied) setUpdateMessage(t('offline.updateBlocked')); })
          .catch(() => setUpdateMessage(t('offline.actionFailed')));
      }}><RefreshCw size={15} aria-hidden />{t('offline.update')}</button></div>}
  </div>;
}
