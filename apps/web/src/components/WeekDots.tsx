const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']; // dom..sáb (índice = weekday)

/** Mostra os 7 dias da semana, marcando os treinados. `week` indexado por weekday (0=dom). */
export function WeekDots({ week, order }: { week: boolean[]; order: number[] }) {
  return (
    <div className="week-dots">
      {order.map((wd) => (
        <div className="d" key={wd}>
          <div className="wd">{WD[wd]}</div>
          <div className={'dot' + (week[wd] ? ' on' : '')}>{week[wd] ? '✓' : ''}</div>
        </div>
      ))}
    </div>
  );
}
