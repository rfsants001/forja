import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, Dumbbell, Swords, Play, RotateCcw, type LucideIcon } from 'lucide-react';
import { computeStreak, weekActivity, startOfWeek, toISO, effectiveRoutine } from '@forja/core';
import { db } from '../db/db';
import { getWeekPlan, listOverrides } from '../db/repo';
import { useSessionStore } from '../store/session';
import { StreakPill } from '../components/StreakPill';
import { WeekDots } from '../components/WeekDots';

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  dumbbell: Dumbbell,
  swords: Swords,
};

// ---------------------------------------------------------------------------
// Card "Treino de hoje"
// ---------------------------------------------------------------------------

interface TreinoHojeCardProps {
  todayRoutine: { id: string; name: string } | null | undefined;
  hasRoutines: boolean | undefined;
  hasActiveSession: boolean;
  onStart: () => void;
}

function TreinoHojeCard({ todayRoutine, hasRoutines, hasActiveSession, onStart }: TreinoHojeCardProps) {
  return (
    <section className="card today-card" aria-labelledby="today-workout">
      <h2 id="today-workout">{hasActiveSession ? 'Treino em andamento' : 'Treino de hoje'}</h2>
      {hasActiveSession ? (
        <div className="today-actions"><button className="btn" onClick={onStart}><RotateCcw size={18} aria-hidden />Continuar treino</button></div>
      ) : todayRoutine === undefined || hasRoutines === undefined ? (
        <p role="status">Carregando sua agenda…</p>
      ) : todayRoutine !== null ? (
        <>
          <p>{todayRoutine.name}</p>
          <div className="today-actions"><button className="btn" onClick={onStart}><Play size={18} aria-hidden />Iniciar treino</button></div>
        </>
      ) : hasRoutines ? (
        <>
          <p>Nenhum treino programado para hoje.</p>
          <div className="today-actions"><Link className="btn ghost" to="/treinos">Escolher uma rotina</Link></div>
        </>
      ) : (
        <>
          <p>Escolha como montar seu primeiro treino.</p>
          <div className="today-actions">
            <Link className="btn" to="/treinos?planos=1">Começar com um plano</Link>
            <Link className="btn ghost" to="/treinos/rotina/nova">Criar rotina</Link>
            <Link className="btn ghost" to="/perfil#importar-historico">Importar histórico</Link>
          </div>
        </>
      )}
    </section>
  );
}

export function Home() {
  const navigate = useNavigate();
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray(), []);
  const workouts = useLiveQuery(() => db.workouts.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get('app'), []);

  // Rotina efetiva de hoje
  const hasRoutines = useLiveQuery(async () => (await db.routines.count()) > 0, []);
  const todayRoutine = useLiveQuery(async () => {
    const today = toISO(new Date());
    const [weekPlan, overrides] = await Promise.all([getWeekPlan(), listOverrides()]);
    const routineId = effectiveRoutine(today, weekPlan, overrides);
    if (routineId === null || routineId === 'rest') return null;
    return (await db.routines.get(routineId)) ?? null;
  }, []);

  const activeSession = useSessionStore((s) => s.active);

  const dates = (workouts ?? []).map((w) => w.dateISO);
  const streak = computeStreak(dates);
  const weekStartsOn = settings?.weekStartsOn ?? 1;
  const today = toISO(new Date());
  const weekStart = startOfWeek(today, weekStartsOn);
  const week = weekActivity(dates, weekStart);
  // ordem de exibição dos dots conforme início da semana
  const order = Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7);

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <span className="mark">
            <Dumbbell size={20} strokeWidth={2.6} />
          </span>
          <h1>
            For<em>ja</em>
          </h1>
        </div>
        <StreakPill current={streak.current} alive={streak.alive} />
      </div>

      {/* CTA Treino de hoje */}
      <TreinoHojeCard
        todayRoutine={todayRoutine}
        hasRoutines={hasRoutines}
        hasActiveSession={activeSession !== null}
        onStart={() => navigate('/treino')}
      />

      <div className="card">
        <div className="section-title" style={{ margin: '0 0 2px' }}>
          Sua semana
        </div>
        <p className="hint">
          {dates.length === 0
            ? 'Nenhum treino registrado ainda. Bora inaugurar?'
            : `${week.filter(Boolean).length} dia(s) treinados nesta semana.`}
        </p>
        <WeekDots week={week} order={order} />
      </div>

      <div className="section-title">Categorias</div>
      <div className="cat-grid">
        {(categories ?? []).map((c) => {
          const Icon = ICONS[c.icon ?? ''] ?? Activity;
          return (
            <Link
              key={c.id}
              to="/treinos"
              className="cat-tile"
              style={{ ['--accent' as string]: c.color }}
            >
              <span className="ico">
                <Icon size={22} strokeWidth={2.4} />
              </span>
              <div>
                <div className="name">{c.name}</div>
                <div className="meta">ver treinos</div>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="hint" style={{ textAlign: 'center', marginTop: 28 }}>
        Local-first · seus dados ficam neste aparelho 🔒
      </p>
    </>
  );
}
