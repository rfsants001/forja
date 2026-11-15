import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, compareWorkouts, daysBetween, fromISO, toISO } from '@forja/core';
import { db } from '../db/db';
import { useT } from '../lib/i18n';
import '../styles/load-trend.css';

export function LoadTrend() {
  const t = useT();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const [weeks, setWeeks] = useState(4);
  const [selected, setSelected] = useState('');
  const [point, setPoint] = useState('');
  const logs = useLiveQuery(() => db.workouts.toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const unit = settings?.unit ?? 'kg';
  const locale = settings?.lang === 'en' ? 'en-US' : 'pt-BR';
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const quantity = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const today = toISO(new Date());
  const start = addDays(today, -(weeks * 7 - 1));
  const data = useMemo(() => {
    const result = new Map<string, { key: string; dateISO: string; kg: number }[]>();
    for (const log of [...(logs ?? [])].sort(compareWorkouts)) {
      const highest = new Map<string, number>();
      for (const entry of log.entries) {
        for (const set of entry.sets) {
          const kg = set.weightKg;
          if (!set.done || kg === undefined || !Number.isFinite(kg) || kg <= 0) continue;
          highest.set(entry.exerciseId, Math.max(kg, highest.get(entry.exerciseId) ?? 0));
        }
      }
      for (const [exerciseId, kg] of highest) {
        const existing = result.get(exerciseId) ?? [];
        existing.push({ key: log.id, dateISO: log.dateISO, kg });
        result.set(exerciseId, existing);
      }
    }
    return result;
  }, [logs]);
  const names = new Map((exercises ?? []).map((row) => [row.id, row.name]));
  const choices = [...data.keys()].sort((a, b) => (names.get(a) ?? a).localeCompare(names.get(b) ?? b, locale));
  const exercise = data.has(selected) ? selected : [...choices].sort((a, b) =>
    (data.get(b)?.at(-1)?.dateISO ?? '').localeCompare(data.get(a)?.at(-1)?.dateISO ?? ''))[0] ?? '';
  const values = (data.get(exercise) ?? []).filter((row) => row.dateISO >= start && row.dateISO <= today)
    .map((row) => ({ ...row, weight: unit === 'lb' ? row.kg / 0.45359237 : row.kg }));
  const latest = values.at(-1);
  const index = values.findIndex((row) => row.key === point);
  const activeIndex = index < 0 ? values.length - 1 : index;
  const active = values[activeIndex];
  const delta = latest && values.length > 1 ? latest.weight - values[0]!.weight : undefined;
  const padding = { left: 45, right: 12, top: 10, bottom: 24 };
  const height = 159;
  const floor = Math.max(0, Math.min(...values.map((row) => row.weight)) - 2);
  const ceil = Math.max(...values.map((row) => row.weight)) + 2;
  const rows = values.map((value) => ({
    ...value,
    x: padding.left + (width - padding.left - padding.right) * daysBetween(start, value.dateISO) / (weeks * 7 - 1),
    y: padding.top + (height - padding.top - padding.bottom) * (ceil - value.weight) / (ceil - floor),
  }));

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.max(180, entry.contentRect.width)); });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="card load-trend" aria-labelledby={id}>
      <div className="load-heading"><h2 className="section-title panel-title" id={id}>{t('load.title')}</h2>
        <p className="hint">{t('load.subtitle')}</p></div>
      {choices.length > 0 && (
        <div className="load-filters">
          <label>{t('load.exercise')}<select value={exercise} onChange={(event) => {
            setSelected(event.target.value); setPoint('');
          }}>{choices.map((key) => <option key={key} value={key}>{names.get(key) ?? t('hist.exerciseFallback', [key])}</option>)}</select></label>
          <label>{t('load.period')}<select value={weeks} onChange={(event) => {
            setWeeks(Number(event.target.value)); setPoint('');
          }}><option value={4}>{t('load.window', [4])}</option><option value={8}>{t('load.window', [8])}</option></select></label>
        </div>
      )}
      <div ref={ref}>
        {latest ? (
          <>
            <p className="load-latest"><strong>{quantity.format(latest.weight)} {unit}</strong>
              {delta !== undefined && <small>{t('load.delta', [(delta > 0 ? '+' : '') + quantity.format(delta) + ' ' + unit])}</small>}
            </p>
            <svg className="load-chart-svg" width="100%" height={height} viewBox={'0 0 ' + width + ' ' + height} aria-hidden="true">
              {[0, 1, 2].map((step) => {
                const y = padding.top + (height - padding.top - padding.bottom) * step / 2;
                return <g key={step}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="load-axis" />
                  <text textAnchor="end" x={padding.left - 4} y={y + 4}>{quantity.format(ceil - (ceil - floor) * step / 2)}</text></g>;
              })}
              <text x={padding.left} y={height - 4}>{date.format(fromISO(start))}</text>
              <text textAnchor="end" x={width - padding.right} y={height - 4}>{date.format(fromISO(today))}</text>
              {rows.length > 1 && <polyline className="load-line" vectorEffect="non-scaling-stroke" points={rows.map((row) => row.x + ',' + row.y).join(' ')} />}
              {rows.map((row, i) => <g key={row.key}>
                <circle cx={row.x} cy={row.y} r={i === activeIndex ? 5 : 3} className="load-dot" />
                <circle cx={row.x} cy={row.y} r={12} fill="transparent" onClick={() => setPoint(row.key)} />
              </g>)}
            </svg>
            {active && <p className="hint" role="status">{date.format(fromISO(active.dateISO))} · {quantity.format(active.weight)} {unit}</p>}
            <div className="load-controls">
              <button type="button" className="btn ghost" aria-label={t('load.previous')} aria-disabled={activeIndex <= 0}
                onClick={() => { if (activeIndex > 0) setPoint(values[activeIndex - 1]!.key); }}><ChevronLeft size={16} aria-hidden="true" /></button>
              <button type="button" className="btn ghost" aria-label={t('load.next')} aria-disabled={activeIndex >= values.length - 1}
                onClick={() => { if (activeIndex < values.length - 1) setPoint(values[activeIndex + 1]!.key); }}><ChevronRight size={16} aria-hidden="true" /></button>
              <details><summary>{t('load.values')}</summary>
                <table className="self-host-table">
                  <thead><tr><th scope="col">{t('load.date')}</th><th scope="col">{t('load.weight')}</th></tr></thead>
                  <tbody>{values.map((row) => <tr key={row.key}><td>{date.format(fromISO(row.dateISO))}</td>
                    <td>{quantity.format(row.weight)} {unit}</td></tr>)}</tbody>
                </table>
              </details>
            </div>
          </>
        ) : <p className="hint">{t('load.empty')}</p>}
      </div>
    </section>
  );
}
