import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronRight, Dumbbell, Play, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { addDays, compareWorkouts, computeStreak, effectiveRoutine, fromISO, startOfWeek, toISO } from '@forja/core';
import { db } from '../db/db';
import { getWeekPlan, listOverrides } from '../db/repo';
import { useSessionStore } from '../store/session';

const dateLong = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const dateShort = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function Home() {
  const today = toISO(new Date());
  const dashboard = useLiveQuery(async () => {
    const [routines, plan, overrides, workouts, settings, latestWeight] = await Promise.all([
      db.routines.toArray(), getWeekPlan(), listOverrides(), db.workouts.toArray(),
      db.settings.get('app'), db.bodyweight.orderBy('dateISO').last(),
    ]);
    const routineById = new Map(routines.map((routine) => [routine.id, routine]));
    const routineOn = (date: string) => {
      const id = effectiveRoutine(date, plan, overrides);
      return id === null ? undefined : routineById.get(id);
    };
    const start = startOfWeek(today, settings?.weekStartsOn ?? 1);
    const completedDates = new Set(workouts.map((workout) => workout.dateISO));
    const next = Array.from({ length: 14 }, (_, offset) => {
      const date = addDays(today, offset + 1);
      return { date, routine: routineOn(date) };
    }).find((day) => day.routine?.exercises.length);
    const week = Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(start, offset);
      return { date, routine: routineOn(date), completed: completedDates.has(date) };
    });
    return {
      todayRoutine: routineOn(today), next, week, routineById, total: workouts.length, latestWeight,
      streak: computeStreak([...completedDates], today),
      ready: routines.some((routine) => routine.exercises.length > 0),
      recent: workouts.sort((a, b) => compareWorkouts(b, a)).slice(0, 3),
    };
  }, [today]);
  const active = useSessionStore((state) => state.active);
  const routine = dashboard?.todayRoutine;
  const hasToday = !!routine?.exercises.length;
  const firstVisit = dashboard !== undefined && !dashboard.ready;
  const title = active !== null ? active.routineName ?? 'Treino em andamento'
    : hasToday ? routine.name : firstVisit ? 'Monte seu primeiro treino'
    : dashboard ? 'Dia livre' : 'Treino de hoje';
  const completedDays = dashboard?.week.filter((day) => day.completed).length ?? 0;
  const date = fromISO(today);

  return (
    <div className="journal">
      <header className="journal-heading">
        <div>
          <p className="journal-date"><CalendarDays size={15} aria-hidden /> <time dateTime={today}>{dateLong.format(date)}</time></p>
          <h1>Caderno de treino</h1>
        </div>
        <Link className="btn ghost journal-plan" to="/treinos">Planejar treino <ArrowUpRight size={17} aria-hidden /></Link>
      </header>

      <div className="journal-grid">
        <section className="journal-session" aria-labelledby="today-workout">
          <div className="journal-session-content">
            <p className="journal-session-label">{active ? 'Sessão em andamento' : 'Treino de hoje'}</p>
            <h2 id="today-workout">{title}</h2>
            {active ? (
              <p>{active.exercises.length} exercícios na sessão</p>
            ) : hasToday ? (
              <p>{routine.exercises.length} exercícios · {routine.exercises.reduce((count, exercise) => count + exercise.sets, 0)} séries</p>
            ) : firstVisit ? (
              <p>Escolha um plano, crie uma rotina ou traga seu histórico.</p>
            ) : dashboard ? (
              <p>{dashboard.next?.routine
                ? `Próximo treino: ${dashboard.next.routine.name} · ${dateShort.format(fromISO(dashboard.next.date))}`
                : 'Nenhuma rotina programada para hoje.'}</p>
            ) : (
              <p role="status">Carregando agenda…</p>
            )}
            {active || hasToday ? (
              <Link className="btn journal-start" to="/treino"><Play size={17} fill="currentColor" aria-hidden />{active ? 'Continuar treino' : 'Iniciar treino'}</Link>
            ) : firstVisit ? (
              <Link className="btn journal-start" to="/treinos?planos=1">Começar com um plano <ArrowRight size={18} aria-hidden /></Link>
            ) : dashboard ? (
              <Link className="btn journal-start" to="/treinos">Escolher uma rotina <ArrowRight size={18} aria-hidden /></Link>
            ) : null}
          </div>
        </section>

        <section className="journal-panel journal-week" aria-labelledby="journal-week">
          <header className="journal-panel-heading">
            <h2 id="journal-week">Sua semana</h2>
            <Link to="/treinos#agenda" className="journal-panel-link">Agenda <ArrowUpRight size={15} aria-hidden /></Link>
          </header>
          {dashboard && (
            <ol className="journal-days">
              {dashboard.week.map((day) => (
                <li key={day.date}>
                  <Link to={`/treinos?data=${day.date}#agenda`} aria-current={day.date === today ? 'date' : undefined}>
                    <time dateTime={day.date}><span>{weekday.format(fromISO(day.date))}</span><strong>{fromISO(day.date).getDate()}</strong></time>
                    <span className="journal-day-routine">{day.routine?.name ?? 'Dia livre'}</span>
                    {day.completed ? <Check size={17} className="journal-day-done" aria-label="Treino registrado" /> : <ChevronRight size={15} aria-hidden />}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="journal-panel journal-recent" aria-labelledby="journal-recent">
          <header className="journal-panel-heading">
            <h2 id="journal-recent">Últimos treinos</h2>
            <Link className="journal-panel-link" to="/historico">Histórico <ArrowUpRight size={15} aria-hidden /></Link>
          </header>
          {dashboard?.recent.length ? (
            <ul className="journal-log">
              {dashboard.recent.map((workout) => (
                <li key={workout.id}>
                  <Dumbbell size={17} aria-hidden />
                  <Link to={`/historico?treino=${encodeURIComponent(workout.id)}`}>{dashboard.routineById.get(workout.routineId ?? '')?.name ?? workout.routineName ?? workout.note ?? 'Treino livre'}</Link>
                  <time dateTime={workout.dateISO}>{dateShort.format(fromISO(workout.dateISO))}</time>
                </li>
              ))}
            </ul>
          ) : dashboard ? (
            <div className="journal-empty"><Dumbbell size={21} aria-hidden /><p>Os treinos concluídos aparecem aqui.</p></div>
          ) : null}
          {firstVisit && (
            <div className="journal-quick-actions">
              <Link className="btn ghost" to="/treinos/rotina/nova"><Plus size={17} aria-hidden /> Criar rotina</Link>
              <Link className="btn ghost" to="/perfil#importar-historico"><ArrowDownToLine size={17} aria-hidden /> Importar histórico</Link>
            </div>
          )}
        </section>

        <section className="journal-panel journal-stats" aria-labelledby="journal-stats">
          <header className="journal-panel-heading">
            <h2 id="journal-stats">Em números</h2>
            <Link className="journal-panel-link" to="/progresso">Progresso <ArrowUpRight size={15} aria-hidden /></Link>
          </header>
          <dl>
            <div><dt>Dias treinados na semana</dt><dd>{dashboard ? completedDays : '—'}</dd></div>
            <div><dt>Treinos registrados</dt><dd>{dashboard?.total ?? '—'}</dd></div>
            {!!dashboard?.streak.current && <div><dt>Dias seguidos</dt><dd>{dashboard.streak.current}</dd></div>}
            {dashboard?.latestWeight && <div><dt>Último peso corporal</dt><dd>{number.format(dashboard.latestWeight.kg)} <small>kg</small></dd></div>}
          </dl>
        </section>
      </div>
    </div>
  );
}
