import '../styles/setup.css';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Plus, Dumbbell, CalendarDays, Library } from 'lucide-react';
import type { Weekday } from '@forja/core';
import { db } from '../db/db';
import { setWeekday } from '../db/repo';

// ---------------------------------------------------------------------------
// Helpers de label do dia da semana
// ---------------------------------------------------------------------------

const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

const WEEKDAY_FULL: Record<Weekday, string> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function Treinos() {
  // Dados reativos
  const categories = useLiveQuery(
    () => db.categories.orderBy('order').toArray(),
    [],
  );
  const routines = useLiveQuery(
    () => db.routines.orderBy('order').toArray(),
    [],
  );
  const weekPlanRows = useLiveQuery(
    () => db.weekPlan.toArray(),
    [],
  );
  const settings = useLiveQuery(
    () => db.settings.get('app'),
    [],
  );

  // Plano semanal montado em memória
  const weekPlan = useMemo<Record<Weekday, string | null>>(() => {
    const plan: Record<Weekday, string | null> = {
      0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null,
    };
    for (const row of weekPlanRows ?? []) {
      plan[row.weekday] = row.routineId;
    }
    return plan;
  }, [weekPlanRows]);

  // Semana ordenada respeitando weekStartsOn
  const weekStartsOn: 0 | 1 = settings?.weekStartsOn ?? 1;
  const orderedDays = useMemo<Weekday[]>(
    () => Array.from({ length: 7 }, (_, i) => ((i + weekStartsOn) % 7) as Weekday),
    [weekStartsOn],
  );

  // Hoje (para destacar o dia atual no plano)
  const todayWd = new Date().getDay() as Weekday;

  // Rotinas agrupadas por categoria
  const grouped = useMemo(() => {
    const cats = categories ?? [];
    const rots = routines ?? [];
    return cats.map((cat) => ({
      cat,
      routines: rots.filter((r) => r.categoryId === cat.id),
    }));
  }, [categories, routines]);

  const totalRoutines = (routines ?? []).length;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleWeekday(day: Weekday, value: string) {
    await setWeekday(day, value === '__rest__' ? null : value);
  }

  // Saving state por dia (para feedback visual)
  const [saving, setSaving] = useState<Weekday | null>(null);

  async function handleWeekdayChange(day: Weekday, value: string) {
    setSaving(day);
    try {
      await handleWeekday(day, value);
    } finally {
      setSaving(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div className="brand">
          <h1>Treinos</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            to="/exercicios"
            className="btn ghost"
            style={{ padding: '10px 14px', fontSize: 13 }}
          >
            <Library size={16} strokeWidth={2.4} />
            Exercícios
          </Link>
          <Link
            to="/treinos/rotina/nova"
            className="btn"
            style={{ padding: '10px 16px', fontSize: 13 }}
          >
            <Plus size={16} strokeWidth={2.8} />
            Nova rotina
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Seção 1: Rotinas por categoria                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="section-title">
        <Dumbbell size={13} style={{ verticalAlign: 'middle', marginRight: 6, opacity: 0.7 }} />
        Minhas rotinas
      </div>

      {totalRoutines === 0 ? (
        <div className="empty">
          <Dumbbell size={40} strokeWidth={1.6} style={{ opacity: 0.4 }} />
          <p style={{ marginTop: 12 }}>Nenhuma rotina criada ainda.</p>
          <Link
            to="/treinos/rotina/nova"
            className="btn"
            style={{ marginTop: 16, display: 'inline-flex' }}
          >
            <Plus size={16} />
            Criar primeira rotina
          </Link>
        </div>
      ) : (
        <>
          {grouped.map(({ cat, routines: rots }) => {
            if (rots.length === 0) return null;
            return (
              <div key={cat.id} className="routine-group">
                <div className="routine-group-header">
                  <span
                    className="cat-dot"
                    style={{ background: cat.color }}
                  />
                  <span className="cat-name">{cat.name}</span>
                </div>
                <div className="routine-list">
                  {rots.map((r) => (
                    <Link
                      key={r.id}
                      to={`/treinos/rotina/${r.id}`}
                      className="routine-item"
                      style={{ borderLeftColor: cat.color, borderLeftWidth: 3 }}
                    >
                      <div className="routine-info">
                        <div className="routine-name">{r.name}</div>
                        <div className="routine-meta">
                          {r.exercises.length} exercício{r.exercises.length !== 1 ? 's' : ''}
                          {r.note ? ` · ${r.note}` : ''}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Rotinas sem categoria reconhecida (categoria foi deletada) */}
          {(() => {
            const catIds = new Set((categories ?? []).map((c) => c.id));
            const orphans = (routines ?? []).filter((r) => !catIds.has(r.categoryId));
            if (orphans.length === 0) return null;
            return (
              <div className="routine-group">
                <div className="routine-group-header">
                  <span className="cat-dot" style={{ background: 'var(--text-muted)' }} />
                  <span className="cat-name">Sem categoria</span>
                </div>
                <div className="routine-list">
                  {orphans.map((r) => (
                    <Link
                      key={r.id}
                      to={`/treinos/rotina/${r.id}`}
                      className="routine-item"
                    >
                      <div className="routine-info">
                        <div className="routine-name">{r.name}</div>
                        <div className="routine-meta">
                          {r.exercises.length} exercício{r.exercises.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Seção 2: Plano da semana                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="section-title" style={{ marginTop: 28 }}>
        <CalendarDays size={13} style={{ verticalAlign: 'middle', marginRight: 6, opacity: 0.7 }} />
        Plano da semana
      </div>

      {totalRoutines === 0 ? (
        <p className="hint" style={{ textAlign: 'center', paddingBottom: 12 }}>
          Crie uma rotina para começar a planejar sua semana.
        </p>
      ) : (
        <div className="week-plan">
          {orderedDays.map((day) => {
            const isToday = day === todayWd;
            const currentValue = weekPlan[day] ?? '__rest__';
            return (
              <div key={day} className="week-row">
                <span className={`wd-label${isToday ? ' today' : ''}`} title={WEEKDAY_FULL[day]}>
                  {WEEKDAY_SHORT[day]}
                </span>
                <select
                  value={currentValue}
                  onChange={(e) => { void handleWeekdayChange(day, e.target.value); }}
                  disabled={saving === day}
                  aria-label={`Treino de ${WEEKDAY_FULL[day]}`}
                >
                  <option value="__rest__">Descanso</option>
                  {(routines ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      <p className="hint" style={{ textAlign: 'center', marginTop: 24 }}>
        O plano semanal é uma sugestão — você pode alterar qualquer dia antes de treinar.
      </p>
    </>
  );
}
