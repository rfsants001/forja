import { NavLink } from 'react-router-dom';
import { Flame, Dumbbell, CalendarDays, TrendingUp, User } from 'lucide-react';
import { useT } from '../lib/i18n';

export function BottomNav() {
  const t = useT();

  const ITEMS = [
    { to: '/', label: t('nav.today'), Icon: Flame, end: true },
    { to: '/treinos', label: t('nav.workouts'), Icon: Dumbbell, end: false },
    { to: '/historico', label: t('nav.history'), Icon: CalendarDays, end: false },
    { to: '/progresso', label: t('nav.progress'), Icon: TrendingUp, end: false },
    { to: '/perfil', label: t('nav.profile'), Icon: User, end: false },
  ];

  return (
    <nav className="bottomnav">
      <div className="track">
        {ITEMS.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'on' : '')}>
            <Icon className="navico" size={22} strokeWidth={2.2} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
