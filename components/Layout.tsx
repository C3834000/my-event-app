
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Menu, Lock } from 'lucide-react';

const ADMIN_PASSWORD = 'klikef2026';
const AUTH_KEY = 'crm_admin_auth';

const LoginScreen: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, 'true');
      onLogin();
    } else {
      setError(true);
      setPassword('');
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
            onChange={e => { setPassword(e.target.value); setError(false); }}
            placeholder="סיסמה"
            autoFocus
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-center text-lg focus:border-purple-500 focus:outline-none"
          />
          {error && <p className="text-red-500 text-sm text-center">סיסמה שגויה</p>}
          <button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-colors">
            כניסה
          </button>
        </form>
      </div>
    </div>
  );
};

const Layout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(
    sessionStorage.getItem(AUTH_KEY) === 'true'
  );

  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 dir-rtl overflow-hidden">
      {/* Mobile Menu Button */}
      <button 
        onClick={() => setIsSidebarOpen(true)}
        className="lg:hidden fixed top-4 right-4 z-40 bg-slate-900 text-white p-2 rounded-xl shadow-lg"
      >
        <Menu size={24} />
      </button>

      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[55] lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar - Fixed Height */}
      <div className={`fixed inset-y-0 right-0 z-[60] transform transition-transform duration-300 lg:translate-x-0 lg:static lg:block ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      {/* Main Content - Scrollable */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;
