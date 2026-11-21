import '../styles/weekdays.css';
import { Check } from 'lucide-react';
import type { Weekday } from '@forja/core';
import { weekdayOrder } from '../lib/weekdays';
import { useT } from '../lib/i18n';

interface Props {
  selected: ReadonlySet<Weekday>;
  onToggle: (day: Weekday) => void;
  labelledBy: string;
  disabled?: boolean;
}

/** Toggle buttons keep the whole day tappable, without nesting a checkbox in a grid label. */
export function WeekdayPicker({ selected, onToggle, labelledBy, disabled }: Props) {
  const t = useT();
  return (
    <div className="coach-day-picker" role="group" aria-labelledby={labelledBy}>
      {weekdayOrder.map((day) => (
        <button key={day} className="coach-day-toggle" type="button"
          disabled={disabled} aria-label={t('wd.full.' + day)} aria-pressed={selected.has(day)}
          onClick={() => onToggle(day)}>
          <span>{t('wd.short.' + day)}</span>
          <span className="coach-day-indicator" aria-hidden="true">
            {selected.has(day) && <Check size={13} strokeWidth={3} />}
          </span>
        </button>
      ))}
    </div>
  );
}
