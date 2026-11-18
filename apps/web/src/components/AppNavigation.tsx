import { ArrowUpRight, BookOpen, CalendarDays, Dumbbell, Gauge, LibraryBig, LockKeyhole, Settings2 } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSessionStore } from '../store/session';
import { useT } from '../lib/i18n';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

export function AppNavigation() {
  const t = useT();
  const active = useSessionStore((state) => state.active);
  const linked = useLiveQuery(() => db.syncState.get('installation'), []);
  const { pathname } = useLocation();
  const pages = [
    { to: '/', label: t('nav.today'), Icon: BookOpen, end: true },
    { to: '/treinos', label: t('nav.workouts'), Icon: Dumbbell },
    { to: '/historico', label: t('nav.history'), Icon: CalendarDays },
    { to: '/progresso', label: t('nav.progress'), Icon: Gauge },
    { to: '/exercicios', label: t('workouts.exercises'), Icon: LibraryBig },
    { to: '/perfil', label: t('nav.profile'), Icon: Settings2 },
  ];

  return (
    <aside className="app-navigation">
      <Link className="app-wordmark" to="/" aria-label={t('nav.homeAria')}>
        <img className="app-wordmark-icon" src="/favicon.svg" alt="" width="34" height="34" />
        <span>Forja</span>
      </Link>
      <nav className="app-nav-links" aria-label={t('locale.nav')}>
        {pages.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => {
            const current = isActive || (to === '/treinos' && pathname === '/treino');
            return `app-nav-link${current ? ' current' : ''}`;
          }}>
            <Icon size={20} strokeWidth={1.75} aria-hidden />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      {active !== null && pathname !== '/treino' && (
        <Link className="nav-resume" to="/treino">{t('locale.resume')} <ArrowUpRight size={16} aria-hidden /></Link>
      )}
      <div className="nav-storage"><LockKeyhole size={15} aria-hidden /> {t(linked ? 'locale.storageSynced' : 'locale.storage')}</div>
    </aside>
  );
}
