import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Package, Smartphone, Clock, MapPin, ShieldCheck, Star, ArrowLeft } from 'lucide-react';

const PRICING = [
  { qty: 30,  price: 600 },
  { qty: 40,  price: 700 },
  { qty: 50,  price: 800 },
  { qty: 75,  price: 1000 },
  { qty: 100, price: 1200 },
  { qty: 120, price: 1500 },
  { qty: 150, price: 1800 },
  { qty: 200, price: 2300 },
];

const STEPS = [
  { icon: '📦', title: 'מקבלים את הערכה', desc: 'ערכת קליקרים נשלחת אליכם לפני האירוע' },
  { icon: '📱', title: 'מורידים את האפליקציה', desc: 'קישור להורדה נשלח לאחר ביצוע התשלום' },
  { icon: '🎯', title: 'מכינים את החידון', desc: 'בונים שאלות ותשובות בממשק הנוח שלנו' },
  { icon: '🎉', title: 'מפעילים באירוע', desc: 'כל אחד מהמשתתפים מחזיק קליקר ולוחץ' },
  { icon: '🔙', title: 'מחזירים למחרת', desc: 'ערכת הקליקרים מוחזרת עד השעה 11:00' },
];

const INCLUDES = [
  'קליקרים לפי מספר המשתתפים',
  'אפליקציית ניהול חידון',
  'סרטון הדרכה מלא',
  'חוברת הוראות',
  'תמיכה טכנית לפני האירוע',
];

const Klik4YouInfo: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-950 to-slate-900 text-white" dir="rtl">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-blue-600/10" />
        <div className="relative max-w-2xl mx-auto px-4 pt-14 pb-10 text-center">
          <div className="inline-flex items-center gap-2 bg-purple-500/20 border border-purple-400/30 rounded-full px-4 py-1.5 text-sm font-bold text-purple-200 mb-6">
            <Star size={14} /> ערכת קליקרים להפעלה עצמאית
          </div>
          <img
            src="/activity-3-klik4you.png"
            alt="קליק פור יו"
            className="w-36 h-36 object-contain mx-auto mb-6 drop-shadow-2xl"
            style={{ filter: 'drop-shadow(0 0 30px rgba(168,85,247,0.5))' }}
          />
          <h1 className="text-4xl font-black mb-3">
            קליק פור יו
          </h1>
          <p className="text-xl text-purple-200 font-bold mb-2">ערכת קליקרים להשכרה בהפעלה עצמית</p>
          <p className="text-purple-300/80 text-sm leading-relaxed max-w-md mx-auto">
            מתאים לאירועים שבהם אין צורך במנחה — אתם מפעילים את החידון בעצמכם עם ציוד מקצועי
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-20 space-y-8">

        {/* How it works */}
        <section className="bg-white/8 border border-white/10 rounded-3xl p-6">
          <h2 className="text-xl font-black text-white mb-5 flex items-center gap-2">
            <span className="text-2xl">🔄</span> איך זה עובד?
          </h2>
          <div className="space-y-4">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-xl shrink-0">
                  {s.icon}
                </div>
                <div>
                  <p className="font-black text-white text-sm">{s.title}</p>
                  <p className="text-purple-200/70 text-xs mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What's included */}
        <section className="bg-white/8 border border-white/10 rounded-3xl p-6">
          <h2 className="text-xl font-black text-white mb-5 flex items-center gap-2">
            <Package size={22} className="text-purple-300" /> מה כלול בערכה?
          </h2>
          <ul className="space-y-3">
            {INCLUDES.map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-sm text-purple-100">
                <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-400/20 rounded-2xl">
            <p className="text-xs text-amber-200 flex items-start gap-2">
              <ShieldCheck size={14} className="shrink-0 mt-0.5 text-amber-300" />
              חובה לבדוק שהכל תקין לפחות 12 שעות לפני האירוע. ציוד הגברה והקרנה אינם כלולים בהשכרה.
            </p>
          </div>
        </section>

        {/* Pricing */}
        <section className="bg-white/8 border border-white/10 rounded-3xl p-6">
          <h2 className="text-xl font-black text-white mb-2 flex items-center gap-2">
            <span className="text-2xl">💰</span> מחירים
          </h2>
          <p className="text-xs text-purple-300/70 mb-5">המחירים אינם כוללים מע"מ</p>
          <div className="grid grid-cols-2 gap-2">
            {PRICING.map(({ qty, price }) => (
              <div key={qty} className="flex justify-between items-center bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <span className="text-sm font-bold text-purple-200">{qty} קליקרים</span>
                <span className="font-black text-white">₪{price.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-purple-300/60 mt-3 text-center">מעל 200 משתתפים — צרו קשר</p>
        </section>

        {/* Important notes */}
        <section className="bg-white/8 border border-white/10 rounded-3xl p-6 space-y-3">
          <h2 className="text-xl font-black text-white mb-4 flex items-center gap-2">
            <span className="text-2xl">📋</span> חשוב לדעת
          </h2>
          {[
            { icon: <Clock size={15} />, text: 'יש להחזיר את הערכה למחרת האירוע עד השעה 11:00' },
            { icon: <Smartphone size={15} />, text: 'קישור להורדת התוכנה נשלח לאחר ביצוע התשלום ושליחת אסמכתא' },
            { icon: <MapPin size={15} />, text: 'הערכה נשלחת אליכם — כתובת המשלוח תתואם בהזמנה' },
            { icon: <ShieldCheck size={15} />, text: 'על כל קליקר חסר ייגבה תשלום של ₪100' },
          ].map((n, i) => (
            <div key={i} className="flex items-start gap-3 text-sm text-purple-200/80">
              <span className="text-purple-400 shrink-0 mt-0.5">{n.icon}</span>
              {n.text}
            </div>
          ))}
        </section>

        {/* CTA */}
        <div className="text-center space-y-4">
          <Link
            to="/check-availability"
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-l from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-4 px-10 rounded-2xl shadow-xl text-lg transition-all w-full"
          >
            בדוק זמינות ומחיר ←
          </Link>
          <Link
            to="/book"
            className="inline-flex items-center justify-center gap-2 bg-white/10 border border-white/20 hover:bg-white/20 text-white font-bold py-3 px-8 rounded-2xl text-sm transition-all w-full"
          >
            <ArrowLeft size={16} /> לטופס הזמנה מלא
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Klik4YouInfo;
