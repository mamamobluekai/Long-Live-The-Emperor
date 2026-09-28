import { NavLink } from 'react-router-dom';
import { Home, Megaphone, MessageCircle, User } from 'lucide-react';
import styles from './StudentMobileNav.module.css';

const ITEMS = [
  { to: '/dashboard/student/overview', label: 'Home', icon: Home },
  { to: '/dashboard/student/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/dashboard/student/group-chat', label: 'Messenger', icon: MessageCircle },
  { to: '/dashboard/student/profile', label: 'Profile', icon: User },
];

export default function StudentMobileNav() {
  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <nav className={styles.bottomBar} aria-label="Quick navigation">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to.endsWith('overview')}
            className={({ isActive }) =>
              `${styles.item} ${isActive ? styles.itemActive : ''}`
            }
          >
            <Icon size={19} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
      </nav>
    </>
  );
}
