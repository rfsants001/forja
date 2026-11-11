// Hook para manter a tela ligada durante o treino ativo.
// Usa a WakeLock API (disponível em browsers modernos com HTTPS).
// Silencia erros — se o browser não suportar, o treino segue normalmente.

import { useEffect, useRef } from 'react';

export function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  async function acquire() {
    if (!('wakeLock' in navigator)) return;
    try {
      lockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      // Silencia: permissão negada ou API indisponível.
    }
  }

  function release() {
    if (lockRef.current !== null) {
      void lockRef.current.release();
      lockRef.current = null;
    }
  }

  useEffect(() => {
    void acquire();

    // Re-adquire quando o documento volta ao foco (tab/app switch).
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void acquire();
      } else {
        release();
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      release();
    };
  }, []);
}
