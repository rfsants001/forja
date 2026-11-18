import { LoadTrend } from '../components/LoadTrend';
import { useT } from '../lib/i18n';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronRight, Dumbbell, Play, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { addDays, compareWorkouts, computeStreak, effectiveRoutine, fromISO, startOfWeek, toISO } from '@forja/core';
import { db } from '../db/db';
import { getWeekPlan, listOverrides } from '../db/repo';
import { useSessionStore } from '../store/session';


export function Home() {
  const t = useT();
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
    const todayRoutine = routineOn(today);
    const preview = todayRoutine?.exercises.slice(0, 3) ?? [];
    const exerciseNames = await db.exercises.bulkGet(preview.map(({ exerciseId }) => exerciseId));
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
      lang: settings?.lang, todayRoutine, next, week, routineById, total: workouts.length, latestWeight,
      todayExercises: preview.flatMap((item, index) => {
        const exercise = exerciseNames[index];
        return exercise ? [{ name: exercise.name, sets: item.sets, reps: item.targetReps }] : [];
      }),
      streak: computeStreak([...completedDates], today),
      ready: routines.some((routine) => routine.exercises.length > 0),
      recent: workouts.sort((a, b) => compareWorkouts(b, a)).slice(0, 3),
    };
  }, [today]);
  const locale = dashboard?.lang === 'en' ? 'en-US' : 'pt-BR';
  const dateLong = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const dateShort = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const active = useSessionStore((state) => state.active);
  const routine = dashboard?.todayRoutine;
  const hasToday = !!routine?.exercises.length;
  const firstVisit = dashboard !== undefined && !dashboard.ready;
  const title = active !== null ? active.routineName ?? t('home.ongoing')
    : hasToday ? routine.name : firstVisit ? t('home.buildFirst')
    : dashboard ? t('home.freeDay') : t('home.today');
  const completedDays = dashboard?.week.filter((day) => day.completed).length ?? 0;
  const date = fromISO(today);

  return (
    <div className="journal">
      <header className="journal-heading">
        <div>
          <p className="journal-date"><CalendarDays size={15} aria-hidden /> <time dateTime={today}>{dateLong.format(date)}</time></p>
          <h1>{t('locale.home')}</h1>
        </div>
        <Link className="btn ghost journal-plan" to="/treinos">{t("ui.planWorkout")} <ArrowUpRight size={17} aria-hidden /></Link>
      </header>

      <div className="journal-grid">
        <section className="journal-panel journal-session" aria-labelledby="today-workout">
          <p className="journal-session-label"><Dumbbell size={16} aria-hidden />{active ? t("ui.activeSession") : t("home.today")}</p>
          <h2 id="today-workout">{title}</h2>
          {active ? (
            <p>{t('ui.sessionExercisesCount', [active.exercises.length])}</p>
          ) : hasToday ? (
            <p>{t('ui.sessionExercisesCount', [routine.exercises.length])}</p>
          ) : firstVisit ? (
            <p>{t("ui.chooseFirst")}</p>
          ) : dashboard ? (
            <p>{dashboard.next?.routine
              ? t('home.nextWorkout', [dashboard.next.routine.name, dateShort.format(fromISO(dashboard.next.date))])
              : t("ui.noScheduled")}</p>
          ) : (
            <p role="status">{t("ui.agendaLoading")}</p>
          )}
          {!active && !!dashboard?.todayExercises.length && (
            <ul className="journal-routine-preview">
              {dashboard.todayExercises.map(({ name, sets, reps }, index) => (
                <li key={index}>
                  <span>{name}</span>
                  <strong>{reps ? `${sets} × ${reps}` : t('ui.sessionSetsCount', [sets])}</strong>
                </li>
              ))}
            </ul>
          )}
          {active || hasToday ? (
            <Link className="btn journal-start" to="/treino"><Play size={17} fill="currentColor" aria-hidden />{active ? t("home.continue") : t("home.start")}</Link>
          ) : firstVisit ? (
            <Link className="btn journal-start" to="/treinos?planos=1">{t("ui.startWithPlan")} <ArrowRight size={18} aria-hidden /></Link>
          ) : dashboard ? (
            <Link className="btn journal-start" to="/treinos">{t("ui.chooseRoutine")} <ArrowRight size={18} aria-hidden /></Link>
          ) : null}
        </section>

        <LoadTrend />
        <section className="journal-panel journal-week" aria-labelledby="journal-week">
          <header className="journal-panel-heading">
            <h2 id="journal-week">{t("home.yourWeek")}</h2>
            <Link to="/treinos#agenda" className="journal-panel-link">{t("ui.agenda")} <ArrowUpRight size={15} aria-hidden /></Link>
          </header>
          {dashboard && (
            <ol className="journal-days">
              {dashboard.week.map((day) => (
                <li key={day.date}>
                  <Link to={`/treinos?data=${day.date}#agenda`} aria-current={day.date === today ? 'date' : undefined}>
                    <time dateTime={day.date}><span>{weekday.format(fromISO(day.date))}</span><strong>{fromISO(day.date).getDate()}</strong></time>
                    <span className="journal-day-routine">{day.routine?.name ?? 'Dia livre'}</span>
                    {day.completed ? <Check size={17} className="journal-day-done" aria-label={t("ui.workoutLogged")} /> : <ChevronRight size={15} aria-hidden />}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="journal-panel journal-recent" aria-labelledby="journal-recent">
          <header className="journal-panel-heading">
            <h2 id="journal-recent">{t("ui.lastWorkouts")}</h2>
            <Link className="journal-panel-link" to="/historico">{t("nav.history")} <ArrowUpRight size={15} aria-hidden /></Link>
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
            <div className="journal-empty"><Dumbbell size={21} aria-hidden /><p>{t("ui.logsAppear")}</p></div>
          ) : null}
          {firstVisit && (
            <div className="journal-quick-actions">
              <Link className="btn ghost" to="/treinos/rotina/nova"><Plus size={17} aria-hidden />{t("ui.newRoutine")}</Link>
              <Link className="btn ghost" to="/perfil#importar-historico"><ArrowDownToLine size={17} aria-hidden />{t("ui.importHistory")}</Link>
            </div>
          )}
        </section>

        <section className="journal-panel journal-stats" aria-labelledby="journal-stats">
          <header className="journal-panel-heading">
            <h2 id="journal-stats">{t("ui.dashboardNumbers")}</h2>
            <Link className="journal-panel-link" to="/progresso">{t("nav.progress")} <ArrowUpRight size={15} aria-hidden /></Link>
          </header>
          <dl>
            <div><dt>{t("ui.trainingDays")}</dt><dd>{dashboard ? completedDays : '—'}</dd></div>
            <div><dt>{t("ui.loggedWorkouts")}</dt><dd>{dashboard?.total ?? '—'}</dd></div>
            {!!dashboard?.streak.current && <div><dt>{t("ui.streakDays")}</dt><dd>{dashboard.streak.current}</dd></div>}
            {dashboard?.latestWeight && <div><dt>{t("ui.latestWeight")}</dt><dd>{number.format(dashboard.latestWeight.kg)} <small>kg</small></dd></div>}
          </dl>
        </section>
      </div>
    </div>
  );
}
