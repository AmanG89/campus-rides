import { Link, useLocation } from 'react-router-dom';
import React from 'react';
import house   from './house.svg';
import compass from './compass.svg';
import plus    from './plus.svg';
import user    from './user.svg';
import NotificationBell from './NotificationBell';
import './navbar.css';

export default function Navbar() {
  const { pathname } = useLocation();

  const links = [
    { to: "/home",        icon: house,   label: "Home"        },
    { to: "/discover",    icon: compass, label: "Discover"    },
    { to: "/create-trip", icon: plus,    label: "Create Trip" },
    { to: "/profile/1",   icon: user,    label: "Profile"     },
  ];

  return (
    <nav className="nb-nav">
      <Link to="/home" className="nb-brand">
        <div className="nb-brand-icon">
          <svg viewBox="0 0 48 48" fill="none">
            <rect x="4" y="17" width="36" height="21" rx="4" fill="white" opacity=".9"/>
            <rect x="8" y="13" width="24" height="11" rx="3" fill="white" opacity=".7"/>
            <circle cx="13" cy="38" r="4.5" fill="white"/>
            <circle cx="35" cy="38" r="4.5" fill="white"/>
            <rect x="14" y="20" width="6" height="5" rx="1.5" fill="#ff6b35" opacity=".9"/>
            <rect x="22" y="20" width="6" height="5" rx="1.5" fill="#ff6b35" opacity=".9"/>
          </svg>
        </div>
        <span className="nb-brand-name">Campus<span>Rides</span></span>
      </Link>

      <ul className="nb-links">
        {links.map(({ to, icon, label }) => {
          const isActive = pathname === to || pathname.startsWith(to + "/");
          return (
            <li key={to}>
              <Link to={to} className={`nb-link ${isActive ? "nb-link-active" : ""}`}>
                <img src={icon} className="nb-icon" alt={label} />
                {label}
                {isActive && <span className="nb-active-dot" />}
              </Link>
            </li>
          );
        })}
      </ul>

      <NotificationBell />
    </nav>
  );
}