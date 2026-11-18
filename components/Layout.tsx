
import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useCategoryCloudSync } from '../data/taskCategories';
import { Menu, Lock, X } from 'lucide-react';

const AUTH_KEY = 'crm_admin_auth';

const LoginScreen: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        sessionStorage.setItem(AUTH_KEY, 'true');
        onLogin();
        return;
      }
      setError(res.status === 503 ? 'הכניסה לא הוגדרה בשרת' : 'סיסמה שגויה');
      setPassword('');
    } catch {
      setError('לא ניתן להתחבר לשרת');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Lock size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-800">ME-CFM</h1>
          <p className="text-slate-500 text-sm">ניהול אירועים ותזרים</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            placeholder="סיסמה"
            autoFocus
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-center text-lg focus:border-purple-500 focus:outline-none"
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button type="submit" disabled={busy} className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors">
            כניסה
          </button>
        </form>
      </div>
    </div>
  );
};

const Layout: React.FC = () => {
  const { pathname } = useLocation();
  const fullBleed = pathname === '/tasks';
  const fixedDesk = pathname === '/desk';
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(
    sessionStorage.getItem(AUTH_KEY) === 'true'
  );
  // קטגוריות המשימות מתעדכנות מהענן בכל דף (גם בלוח האירועים)
  useCategoryCloudSync(isAuthenticated);

  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 dir-rtl overflow-hidden">
      {/* Mobile Menu Button */}
      <button 
        onClick={() => setIsSidebarOpen(true)}
        className={`${fixedDesk ? 'xl:hidden top-2 right-2' : 'lg:hidden top-4 right-4'} fixed z-40 bg-slate-900 text-white p-2 rounded-xl shadow-lg`}
      >
        <Menu size={24} />
      </button>

      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div 
            className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[55] ${fixedDesk ? 'xl:hidden' : 'lg:hidden'}`}
            onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar - Fixed Height */}
      <div className={`fixed inset-y-0 right-0 z-[60] transform transition-transform duration-300 ${fixedDesk ? 'xl:translate-x-0 xl:static xl:block' : 'lg:translate-x-0 lg:static lg:block'} ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {fixedDesk && isSidebarOpen && <button type="button" onClick={() => setIsSidebarOpen(false)} aria-label="סגירת תפריט" className="hidden lg:block xl:hidden absolute top-4 left-4 z-[70] text-slate-400 hover:text-white"><X size={24} /></button>}
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      {/* Main Content - Scrollable */}
      <main className={`flex-1 min-w-0 ${fixedDesk ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        <div className={fixedDesk ? 'h-full min-h-0 p-2 md:p-3' : fullBleed ? 'p-3 md:p-4' : 'p-4 md:p-8'}>
          <div className={fixedDesk ? 'h-full min-h-0' : fullBleed ? undefined : 'max-w-7xl mx-auto'}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;
