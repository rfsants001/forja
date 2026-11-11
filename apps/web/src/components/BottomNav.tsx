import { NavLink } from 'react-router-dom';
import { Flame, Dumbbell, CalendarDays, User } from 'lucide-react';

const ITEMS = [
  { to: '/', label: 'Hoje', Icon: Flame, end: true },
  { to: '/treinos', label: 'Treinos', Icon: Dumbbell, end: false },
  { to: '/historico', label: 'Histórico', Icon: CalendarDays, end: false },
  { to: '/perfil', label: 'Perfil', Icon: User, end: false },
];

export function BottomNav() {
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
