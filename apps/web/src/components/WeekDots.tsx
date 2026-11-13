import { useT } from '../lib/i18n';

/** Mostra os 7 dias da semana, marcando os treinados. `week` indexado por weekday (0=dom). */
export function WeekDots({ week, order }: { week: boolean[]; order: number[] }) {
  const t = useT();
  return (
    <div className="week-dots">
      {order.map((wd) => (
        <div className="d" key={wd}>
          <div className="wd">{t(`wd.short.${wd}`)}</div>
          <div className={'dot' + (week[wd] ? ' on' : '')}>{week[wd] ? '✓' : ''}</div>
        </div>
      ))}
    </div>
  );
}
