import { Flame } from 'lucide-react';
import { useT } from '../lib/i18n';

/** Pílula de streak. Fase 3 troca o ícone por uma chama animada (Lottie). */
export function StreakPill({ current, alive }: { current: number; alive: boolean }) {
  const t = useT();
  return (
    <div className={'streakpill' + (alive && current > 0 ? '' : ' dead')}>
      <Flame size={22} strokeWidth={2.4} fill={alive && current > 0 ? 'var(--flame-2)' : 'none'} />
      <span className="count">{current}</span>
      <span className="lbl">{t('streak.days')}</span>
    </div>
  );
}
