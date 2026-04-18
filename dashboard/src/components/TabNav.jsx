import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Search, Link2, ClipboardList, Settings, Globe2 } from 'lucide-react';

const tabs = [
  { to: '/overview',  icon: LayoutDashboard, label: 'Overview' },
  { to: '/explorer',  icon: Search,          label: 'Gym Explorer' },
  { to: '/chains',    icon: Link2,           label: 'Chains', badgeId: 'chainCount' },
  { to: '/jobs',      icon: ClipboardList,   label: 'Jobs' },
  { to: '/globe',     icon: Globe2,          label: 'Globe' },
  { to: '/system',    icon: Settings,        label: 'System' },
];

export default function TabNav({ badges = {} }) {
  return (
    <nav className="tab-nav" id="tab-navigation">
      {tabs.map(({ to, icon: Icon, label, badgeId }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `tab-btn${isActive ? ' active' : ''}`}
        >
          <Icon size={15} />
          {label}
          {badgeId && badges[badgeId] != null && (
            <span className="tab-badge">{badges[badgeId]}</span>
          )}
        </NavLink>
      ))}
      <style>{`
        .tab-nav {
          position: sticky; top: 49px; z-index: 99;
          background: var(--bg-tab);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
          display: flex; gap: 0; padding: 0 24px;
          overflow-x: auto; scrollbar-width: none;
          transition: background 0.3s ease;
        }
        .tab-nav::-webkit-scrollbar { display: none; }
        .tab-btn {
          padding: 12px 20px; font-family: var(--font); font-size: 13px; font-weight: 600;
          color: var(--text-muted); cursor: pointer; border: none; background: none;
          border-bottom: 2px solid transparent; transition: all 0.2s;
          display: flex; align-items: center; gap: 6px; white-space: nowrap;
          text-decoration: none;
        }
        .tab-btn:hover { color: var(--text-secondary); text-decoration: none; }
        .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
        .tab-badge {
          font-size: 10px; padding: 1px 6px; border-radius: 10px;
          background: rgba(59, 130, 246, 0.15); color: var(--accent);
          font-family: var(--mono);
        }
        @media (max-width: 640px) {
          .tab-btn { padding: 10px 14px; font-size: 12px; }
        }
      `}</style>
    </nav>
  );
}
