import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, DollarSign, Calendar, Tag } from 'lucide-react';

const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#06b6d4', '#84cc16'];

export default function ChartsBoard() {
  const { events } = useApp();

  // הכנסות לפי חודש
  const revenueByMonth = useMemo(() => {
    const monthMap: Record<string, number> = {};
    events.forEach(ev => {
      if (ev.paidAmount && ev.paidAmount > 0) {
        const date = new Date(ev.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthMap[monthKey] = (monthMap[monthKey] || 0) + ev.paidAmount;
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
      if (ev.paidAmount && ev.paidAmount > 0) {
        typeMap[ev.eventType] = (typeMap[ev.eventType] || 0) + ev.paidAmount;
      }
    });
    return Object.entries(typeMap).map(([type, revenue]) => ({ type, revenue }));
  }, [events]);

  // הכנסות לפי תג
  const revenueByTag = useMemo(() => {
    const tagMap: Record<string, number> = {};
    events.forEach(ev => {
      if (ev.paidAmount && ev.paidAmount > 0 && ev.tag) {
        tagMap[ev.tag] = (tagMap[ev.tag] || 0) + ev.paidAmount;
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
    const totalRevenue = events.reduce((sum, ev) => sum + (ev.paidAmount || 0), 0);
    const totalEvents = events.length;
    const avgRevenue = totalEvents > 0 ? totalRevenue / totalEvents : 0;
    const paidEvents = events.filter(ev => ev.paidAmount && ev.paidAmount > 0).length;
    
    return { totalRevenue, totalEvents, avgRevenue, paidEvents };
  }, [events]);

  return (
    <div className="p-8 space-y-8" dir="rtl">
      {/* כותרת */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-xl">
          <TrendingUp size={28} className="text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-800">דוחות וגרפים</h1>
          <p className="text-slate-500 font-bold">ניתוח פיננסי מעמיק</p>
        </div>
      </div>

      {/* סטטיסטיקות מהירות */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-2xl border-2 border-purple-200">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign size={24} className="text-purple-600" />
            <span className="text-sm font-black text-purple-600">סה"כ הכנסות</span>
          </div>
          <p className="text-3xl font-black text-purple-800">₪{stats.totalRevenue.toLocaleString()}</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-2xl border-2 border-blue-200">
          <div className="flex items-center gap-3 mb-2">
            <Calendar size={24} className="text-blue-600" />
            <span className="text-sm font-black text-blue-600">סה"כ אירועים</span>
          </div>
          <p className="text-3xl font-black text-blue-800">{stats.totalEvents}</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-2xl border-2 border-green-200">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp size={24} className="text-green-600" />
            <span className="text-sm font-black text-green-600">ממוצע לאירוע</span>
          </div>
          <p className="text-3xl font-black text-green-800">₪{Math.round(stats.avgRevenue).toLocaleString()}</p>
        </div>

        <div className="bg-gradient-to-br from-pink-50 to-pink-100 p-6 rounded-2xl border-2 border-pink-200">
          <div className="flex items-center gap-3 mb-2">
            <Tag size={24} className="text-pink-600" />
            <span className="text-sm font-black text-pink-600">אירועים ששולמו</span>
          </div>
          <p className="text-3xl font-black text-pink-800">{stats.paidEvents}</p>
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
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fontWeight: 'bold' }} />
              <YAxis tick={{ fontSize: 12, fontWeight: 'bold' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '2px solid #8b5cf6', 
                  borderRadius: '12px',
                  fontWeight: 'bold'
                }}
                formatter={(value: number) => `₪${value.toLocaleString()}`}
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
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={eventsByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fontWeight: 'bold' }} />
              <YAxis tick={{ fontSize: 12, fontWeight: 'bold' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '2px solid #3b82f6', 
                  borderRadius: '12px',
                  fontWeight: 'bold'
                }}
              />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5, fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* הכנסות לפי סוג אירוע */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-slate-100">
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
            <Tag size={24} className="text-pink-500" />
            הכנסות לפי סוג אירוע
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={revenueByType}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ type, percent }) => `${type} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={100}
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
        </div>

        {/* הכנסות לפי תג */}
        {revenueByTag.length > 0 && (
          <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-slate-100">
            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
              <DollarSign size={24} className="text-green-500" />
              הכנסות לפי תג אירוע
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueByTag} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12, fontWeight: 'bold' }} />
                <YAxis dataKey="tag" type="category" tick={{ fontSize: 12, fontWeight: 'bold' }} width={100} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '2px solid #10b981', 
                    borderRadius: '12px',
                    fontWeight: 'bold'
                  }}
                  formatter={(value: number) => `₪${value.toLocaleString()}`}
                />
                <Bar dataKey="revenue" fill="#10b981" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
