import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Activity, Dumbbell, Swords, type LucideIcon } from 'lucide-react';
import { computeStreak, weekActivity, startOfWeek, toISO } from '@forja/core';
import { db } from '../db/db';
import { StreakPill } from '../components/StreakPill';
import { WeekDots } from '../components/WeekDots';

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  dumbbell: Dumbbell,
  swords: Swords,
};

export function Home() {
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray(), []);
  const workouts = useLiveQuery(() => db.workouts.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get('app'), []);

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
