
import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Calendar, Users, Briefcase, CheckSquare, Settings, FileText, X, ShieldCheck, TrendingUp } from 'lucide-react';
import { useApp } from '../context/AppContext';

const Sidebar: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { userEmail } = useApp();

  const navItems = [
    { to: '/', label: 'דאשבורד', icon: LayoutDashboard },
    { to: '/events', label: 'אירועים (A)', icon: Calendar },
    { to: '/customers', label: 'לקוחות (B)', icon: Users },
    { to: '/leads', label: 'לידים (C)', icon: Briefcase },
    { to: '/tasks', label: 'משימות (D)', icon: CheckSquare },
    { to: '/charts', label: 'דוחות וגרפים', icon: TrendingUp },
    { to: '/forms', label: 'ניהול טפסים', icon: FileText },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-white h-screen flex flex-col shadow-xl">
      {/* Header - Fixed */}
      <div className="p-6 border-b border-slate-700 flex justify-between items-center shrink-0">
        <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            ME-CFM
            </h1>
            <p className="text-xs text-slate-400 mt-1">ניהול אירועים ותזרים</p>
        </div>
        {onClose && (
            <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white">
                <X size={24} />
            </button>
        )}
      </div>

      {/* Navigation - Scrollable */}
      <nav className="flex-1 py-6 space-y-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => onClose?.()}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-3 transition-all duration-200 border-r-4 ${
                isActive
                  ? 'bg-slate-800 border-purple-500 text-purple-400'
                  : 'border-transparent text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <item.icon size={20} />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer - Fixed */}
      <div className="p-4 border-t border-slate-700 bg-slate-800/50 shrink-0">
        <div className="flex items-center gap-3 mb-4 px-2">
           <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center font-bold text-white shadow-lg border border-purple-400">
              {userEmail.charAt(0).toUpperCase()}
           </div>
           <div className="min-w-0">
              <p className="text-xs font-bold truncate">מנהל מערכת</p>
              <div className="flex items-center gap-1">
                 <ShieldCheck size={10} className="text-green-500" />
                 <p className="text-[10px] text-slate-400 truncate">{userEmail}</p>
              </div>
           </div>
        </div>
        <NavLink to="/settings" onClick={() => onClose?.()} className="flex items-center gap-3 px-2 py-2 text-slate-400 hover:text-white transition-colors">
          <Settings size={20} />
          <span className="text-sm">הגדרות</span>
        </NavLink>
      </div>
    </aside>
  );
};

export default Sidebar;
