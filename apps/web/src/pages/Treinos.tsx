import '../styles/setup.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Dumbbell, CalendarDays, Library, Sparkles, X } from 'lucide-react';
import { toISO } from '@forja/core';
import type { Routine, Weekday } from '@forja/core';
import { db } from '../db/db';
import { clearDayOverride, setDayOverride, setWeekday } from '../db/repo';
import { useSessionStore } from '../store/session';
import { STARTER_PLANS, applyStarterPlan } from '../lib/starter-plans';
import type { ApplyResult } from '../lib/starter-plans';

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
// StarterPlansSheet — modal/sheet de seleção e aplicação de planos prontos
// ---------------------------------------------------------------------------

const WEEKDAY_SHORT_LABELS: Record<Weekday, string> = {
  0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb',
};

function StarterPlansSheet({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [replaceDays, setReplaceDays] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    if (selected === null) return;
    setApplying(true);
    setError(null);
    try {
      const res = await applyStarterPlan(selected, replaceDays);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao aplicar plano.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <dialog ref={dialog} className="sheet starter-dialog" aria-labelledby="starter-plans-title" onCancel={(event) => {
      event.preventDefault();
      if (!applying) onClose();
    }}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 id="starter-plans-title" style={{ margin: 0 }}>Planos prontos</h2>
          <button
            className="btn ghost"
            style={{ padding: '8px', borderRadius: '50%' }}
            onClick={onClose}
            disabled={applying}
            aria-label="Fechar"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        {/* Lista de planos */}
        {result === null ? (
          <>
            <div className="sp-plan-list">
              {STARTER_PLANS.map((plan) => (
                <button
                  key={plan.id}
                  className={`sp-plan-card${selected === plan.id ? ' selected' : ''}`}
                  aria-pressed={selected === plan.id}
                  onClick={() => setSelected(plan.id)}
                >
                  <div className="sp-plan-card-header">
                    <span className="sp-plan-dot" style={{ background: plan.color }} />
                    <span className="sp-plan-name">{plan.name}</span>
                    <span className="sp-plan-days">
                      {plan.weekdays.map((d) => WEEKDAY_SHORT_LABELS[d]).join(' / ')}
                    </span>
                  </div>
                  <span className="sp-plan-desc">{plan.description}</span>
                  <div className="sp-plan-routines">
                    {plan.routines.map((r) => (
                      <span key={r.name}>{r.name}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            <label className="starter-replace">
              <input type="checkbox" checked={replaceDays} onChange={(event) => setReplaceDays(event.target.checked)} />
              Substituir treinos nos dias já ocupados
            </label>
            {error !== null && (
              <div className="sp-feedback warn" role="alert">{error}</div>
            )}

            <div className="btn-row">
              <button className="btn ghost" disabled={applying} onClick={onClose}>Cancelar</button>
              <button
                className="btn"
                disabled={selected === null || applying}
                onClick={() => { void handleApply(); }}
              >
                {applying ? 'Aplicando…' : 'Aplicar plano'}
              </button>
            </div>
          </>
        ) : (
          /* Feedback pós-aplicação */
          <>
            <div className="sp-feedback" role="status">
              {result.created > 0
                ? `${result.created} rotina${result.created > 1 ? 's' : ''} criada${result.created > 1 ? 's' : ''} com sucesso!`
                : 'Plano já aplicado — rotinas existentes foram mantidas.'}
              {result.skipped > 0 && (
                <span> ({result.skipped} já existia{result.skipped > 1 ? 'm' : ''})</span>
              )}
            </div>
            {result.preservedDays > 0 && <p className="feedback">{result.preservedDays} dia(s) ocupados foram mantidos.</p>}
            {result.unresolved.length > 0 && (
              <div className="sp-feedback warn" style={{ marginTop: 8 }}>
                Exercícios não encontrados no catálogo:{' '}
                {result.unresolved.join(', ')}
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={onClose}>Fechar</button>
            </div>
          </>
        )}
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

function RoutineRow({ routine, color, activeId }: { routine: Routine; color?: string; activeId: string | null | undefined }) {
  const resume = activeId === routine.id;
  return (
    <div className="routine-list-row">
      <Link to={`/treinos/rotina/${encodeURIComponent(routine.id)}`} className="routine-item"
        style={color ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined} aria-label={`Editar ${routine.name}`}>
        <div className="routine-info">
          <div className="routine-name">{routine.name}</div>
          <div className="routine-meta">{routine.exercises.length} exercício(s){routine.note ? ` · ${routine.note}` : ''}</div>
        </div>
      </Link>
      {routine.exercises.length > 0 && (activeId === null || resume) && (
        <Link className="btn ghost" to={`/treino?routineId=${encodeURIComponent(routine.id)}`}
          aria-label={`${resume ? 'Continuar' : 'Treinar agora'} · ${routine.name}`}>
          {resume ? 'Continuar' : 'Treinar agora'}
        </Link>
      )}
    </div>
  );
}

function DateOverrideEditor({ routines }: { routines: Routine[] }) {
  const [date, setDate] = useState(() => toISO(new Date()));
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const row = useLiveQuery(async () => (await db.dayOverrides.get(date)) ?? null, [date]);
  const value = choice ?? (row?.dateISO === date ? row.routine : null) ?? '';

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      if (value === '') await clearDayOverride(date);
      else await setDayOverride(date, value);
      setFeedback({ text: 'Agenda desta data atualizada.' });
    } catch {
      setFeedback({ text: 'Não foi possível alterar a data. Tente novamente.', error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card date-override" onSubmit={(event) => void save(event)}>
      <h2>Mudar só um dia</h2>
      <p className="hint">Troque a rotina ou marque descanso para uma data. Seu plano semanal continua valendo nos outros dias.</p>
      <label>Data<input type="date" required value={date} disabled={busy} onChange={(event) => {
        setDate(event.target.value); setChoice(null); setFeedback(null);
      }} /></label>
      <label>Treino desta data<select value={value} disabled={busy} onChange={(event) => setChoice(event.target.value)}>
        <option value="">Seguir plano semanal</option>
        <option value="rest">Descanso</option>
        {routines.map((routine) => <option key={routine.id} value={routine.id}>{routine.name}</option>)}
      </select></label>
      <button className="btn ghost" disabled={busy || !date || row === undefined}>{busy ? 'Salvando…' : 'Salvar data'}</button>
      {feedback !== null && <p className={`feedback${feedback.error ? ' error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    </form>
  );
}

export function Treinos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = useSessionStore((state) => state.active);
  const activeId = active === null ? null : active.routineId;
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

  // Sheet de planos prontos
  const showStarterPlans = searchParams.get('planos') === '1';
  function setShowStarterPlans(show: boolean) {
    setSearchParams((params) => {
      if (show) params.set('planos', '1');
      else params.delete('planos');
      return params;
    }, { replace: true });
  }

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
      {/* Sheet de planos prontos */}
      {showStarterPlans && (
        <StarterPlansSheet onClose={() => setShowStarterPlans(false)} />
      )}

      {/* Topbar */}
      <div className="topbar">
        <div className="brand">
          <h1>Treinos</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn ghost"
            style={{ padding: '10px 14px', fontSize: 13 }}
            onClick={() => setShowStarterPlans(true)}
            title="Planos prontos"
          >
            <Sparkles size={16} strokeWidth={2.2} />
          </button>
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <button
              className="btn ghost-accent"
              style={{ display: 'inline-flex', gap: 6 }}
              onClick={() => setShowStarterPlans(true)}
            >
              <Sparkles size={16} strokeWidth={2.2} />
              Começar com um plano pronto
            </button>
            <Link
              to="/treinos/rotina/nova"
              className="btn ghost"
              style={{ display: 'inline-flex' }}
            >
              <Plus size={16} />
              Criar rotina do zero
            </Link>
          </div>
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
                  {rots.map((routine) => <RoutineRow key={routine.id} routine={routine} color={cat.color} activeId={activeId} />)}
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
                  {orphans.map((routine) => <RoutineRow key={routine.id} routine={routine} activeId={activeId} />)}
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
      {totalRoutines > 0 && <DateOverrideEditor routines={(routines ?? []).filter((routine) => routine.exercises.length > 0)} />}
    </>
  );
}
