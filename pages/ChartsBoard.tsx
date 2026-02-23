import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, DollarSign, Calendar, Tag, RefreshCw } from 'lucide-react';

const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#06b6d4', '#84cc16'];

export default function ChartsBoard() {
  const { events } = useApp();
  const [refreshKey, setRefreshKey] = useState(0);

  const getActualRevenue = (ev: any): number => {
    return Math.max(ev.paidAmount || 0, 0);
  };

  // הכנסות לפי חודש
  const revenueByMonth = useMemo(() => {
    const monthMap: Record<string, number> = {};
    events.forEach(ev => {
      const revenue = getActualRevenue(ev);
      if (revenue > 0) {
        const date = new Date(ev.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthMap[monthKey] = (monthMap[monthKey] || 0) + revenue;
      }
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => ({
        month: new Date(month + '-01').toLocaleDateString('he-IL', { month: 'short', year: 'numeric' }),
        revenue
      }));
  }, [events]);

  // הכנסות לפי סוג אירוע
  const revenueByType = useMemo(() => {
    const typeMap: Record<string, number> = {};
    events.forEach(ev => {
      const revenue = getActualRevenue(ev);
      if (revenue > 0) {
        typeMap[ev.eventType] = (typeMap[ev.eventType] || 0) + revenue;
      }
    });
    return Object.entries(typeMap).map(([type, revenue]) => ({ type, revenue }));
  }, [events]);

  // הכנסות לפי תג
  const revenueByTag = useMemo(() => {
    const tagMap: Record<string, number> = {};
    events.forEach(ev => {
      const revenue = getActualRevenue(ev);
      if (revenue > 0 && ev.tag) {
        tagMap[ev.tag] = (tagMap[ev.tag] || 0) + revenue;
      }
    });
    return Object.entries(tagMap).map(([tag, revenue]) => ({ tag, revenue }));
  }, [events]);

  // מספר אירועים לפי חודש
  const eventsByMonth = useMemo(() => {
    const monthMap: Record<string, number> = {};
    events.forEach(ev => {
      const date = new Date(ev.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthMap[monthKey] = (monthMap[monthKey] || 0) + 1;
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({
        month: new Date(month + '-01').toLocaleDateString('he-IL', { month: 'short', year: 'numeric' }),
        count
      }));
  }, [events]);

  // סטטיסטיקות כלליות
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let paidEventsCount = 0;
    
    events.forEach(ev => {
      const revenue = getActualRevenue(ev);
      if (revenue > 0) {
        totalRevenue += revenue;
        paidEventsCount++;
      }
    });
    
    const totalEvents = events.length;
    const avgRevenue = paidEventsCount > 0 ? totalRevenue / paidEventsCount : 0;
    
    console.log('📊 דוחות - סטטיסטיקות:', {
      totalRevenue,
      totalEvents,
      paidEventsCount,
      avgRevenue,
      sampleEvents: events.slice(0, 3).map(e => ({ id: e.id, amount: e.amount, paidAmount: e.paidAmount, paymentStatus: e.paymentStatus }))
    });
    
    return { totalRevenue, totalEvents, avgRevenue, paidEvents: paidEventsCount };
  }, [events]);

  return (
    <div className="p-8 space-y-8" dir="rtl">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-xl">
            <TrendingUp size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-800">דוחות וגרפים</h1>
            <p className="text-slate-500 font-bold">ניתוח פיננסי מעמיק</p>
          </div>
        </div>
        <button onClick={() => setRefreshKey(k => k + 1)} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg hover:bg-purple-700 transition-all">
          <RefreshCw size={18} /> רענן נתונים
        </button>
      </div>

      {stats.totalEvents === 0 ? (
        <div className="bg-gradient-to-br from-slate-50 to-purple-50 p-12 rounded-2xl border-2 border-purple-100 text-center">
          <p className="text-xl font-bold text-slate-500">אין אירועים במערכת עדיין</p>
          <p className="text-sm text-slate-400 mt-2">הוסף אירועים כדי לראות דוחות וגרפים</p>
        </div>
      ) : (
        <>
          <div className="bg-gradient-to-br from-slate-50 to-purple-50 p-6 rounded-2xl border-2 border-purple-100 mb-4">
            <p className="text-sm text-slate-600 font-bold text-center">
              הדוחות מבוססים על <span className="text-purple-700 font-black">{stats.totalEvents}</span> אירועים במערכת, 
              מתוכם <span className="text-green-700 font-black">{stats.paidEvents}</span> אירועים ששולמו 
              בסכום כולל של <span className="text-purple-700 font-black">₪{stats.totalRevenue.toLocaleString()}</span>
            </p>
          </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6" key={refreshKey}>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-2xl border-2 border-purple-200">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign size={24} className="text-purple-600" />
            <span className="text-sm font-black text-purple-600">סה"כ הכנסות</span>
          </div>
          <p className="text-3xl font-black text-purple-800">₪{stats.totalRevenue.toLocaleString()}</p>
          <p className="text-xs text-purple-600 mt-2 font-bold">רק סכומים ששולמו בפועל</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-2xl border-2 border-blue-200">
          <div className="flex items-center gap-3 mb-2">
            <Calendar size={24} className="text-blue-600" />
            <span className="text-sm font-black text-blue-600">סה"כ אירועים</span>
          </div>
          <p className="text-3xl font-black text-blue-800">{stats.totalEvents}</p>
          <p className="text-xs text-blue-600 mt-2 font-bold">כל האירועים במערכת</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-2xl border-2 border-green-200">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp size={24} className="text-green-600" />
            <span className="text-sm font-black text-green-600">ממוצע לאירוע</span>
          </div>
          <p className="text-3xl font-black text-green-800">₪{Math.round(stats.avgRevenue).toLocaleString()}</p>
          <p className="text-xs text-green-600 mt-2 font-bold">מחושב מאירועים ששולמו</p>
        </div>

        <div className="bg-gradient-to-br from-pink-50 to-pink-100 p-6 rounded-2xl border-2 border-pink-200">
          <div className="flex items-center gap-3 mb-2">
            <Tag size={24} className="text-pink-600" />
            <span className="text-sm font-black text-pink-600">אירועים ששולמו</span>
          </div>
          <p className="text-3xl font-black text-pink-800">{stats.paidEvents}</p>
          <p className="text-xs text-pink-600 mt-2 font-bold">{Math.round((stats.paidEvents / stats.totalEvents) * 100)}% מכלל האירועים</p>
        </div>
      </div>

      {/* גרפים */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* הכנסות לפי חודש */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-slate-100">
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
            <Calendar size={24} className="text-purple-500" />
            הכנסות לפי חודש
          </h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={revenueByMonth} margin={{ bottom: 20, right: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11, fontWeight: 'bold' }} 
                angle={-15}
                textAnchor="end"
                height={60}
              />
              <YAxis 
                tick={{ fontSize: 11, fontWeight: 'bold' }} 
                tickFormatter={(value) => `₪${(value / 1000).toFixed(0)}K`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '2px solid #8b5cf6', 
                  borderRadius: '12px',
                  fontWeight: 'bold',
                  direction: 'rtl'
                }}
                formatter={(value: number) => [`₪${value.toLocaleString()}`, 'הכנסה']}
                labelFormatter={(label) => `חודש: ${label}`}
              />
              <Bar dataKey="revenue" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* מספר אירועים לפי חודש */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-slate-100">
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
            <TrendingUp size={24} className="text-blue-500" />
            מספר אירועים לפי חודש
          </h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={eventsByMonth} margin={{ bottom: 20, right: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11, fontWeight: 'bold' }} 
                angle={-15}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 11, fontWeight: 'bold' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '2px solid #3b82f6', 
                  borderRadius: '12px',
                  fontWeight: 'bold',
                  direction: 'rtl'
                }}
                formatter={(value: number) => [`${value}`, 'אירועים']}
                labelFormatter={(label) => `חודש: ${label}`}
              />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 6, fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* הכנסות לפי סוג אירוע */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-slate-100">
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
            <Tag size={24} className="text-pink-500" />
            הכנסות לפי סוג אירוע
          </h2>
          <div className="flex flex-col lg:flex-row gap-6 items-center">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={revenueByType}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={false}
                  outerRadius={90}
                  fill="#8884d8"
                  dataKey="revenue"
                >
                  {revenueByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '2px solid #ec4899', 
                    borderRadius: '12px',
                    fontWeight: 'bold'
                  }}
                  formatter={(value: number) => `₪${value.toLocaleString()}`}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 w-full lg:w-auto">
              {revenueByType.map((entry, index) => (
                <div key={index} className="flex items-center gap-3 text-sm">
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <span className="font-bold text-slate-700 flex-1 min-w-0 truncate">{entry.type}</span>
                  <span className="font-black text-slate-900 shrink-0">₪{entry.revenue.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* הכנסות לפי תג */}
        {revenueByTag.length > 0 && (
          <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-slate-100">
            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
              <DollarSign size={24} className="text-green-500" />
              הכנסות לפי תג אירוע
            </h2>
            <ResponsiveContainer width="100%" height={Math.max(300, revenueByTag.length * 50)}>
              <BarChart data={revenueByTag} layout="vertical" margin={{ right: 30, left: 150 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12, fontWeight: 'bold' }} />
                <YAxis 
                  dataKey="tag" 
                  type="category" 
                  tick={{ fontSize: 11, fontWeight: 'bold', textAnchor: 'end' }} 
                  width={140}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '2px solid #10b981', 
                    borderRadius: '12px',
                    fontWeight: 'bold',
                    direction: 'rtl'
                  }}
                  formatter={(value: number) => [`₪${value.toLocaleString()}`, 'הכנסה']}
                  labelFormatter={(label) => `תג: ${label}`}
                />
                <Bar dataKey="revenue" fill="#10b981" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
