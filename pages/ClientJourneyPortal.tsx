
import React, { useState, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  Download, PlayCircle, Sparkles, ChevronDown, ExternalLink, BookOpen, MapPin, ChevronUp,
  AlertTriangle, CalendarCheck, HelpCircle, FileText, FileSpreadsheet, Image, List, BarChart2, MessageCircle, Mail, Phone,
} from 'lucide-react';

const PORTAL_VIDEO_URL = 'https://drive.google.com/file/d/1-1qFyTUztkknjsREk2tuN8G5-rouYp4N/preview';
const GUIDE_PDF_URL = 'https://drive.google.com/file/d/1gHeYbZFEL88Q3mdtqXkkQeEQsBC9GgmL/view';
const ACTIVATION_GUIDE_URL = 'https://drive.google.com/file/d/1-5xdVHlMEa8tSL1l9MczKwCs1LRIuC1l/view?usp=sharing';
const ACTIVATION_GUIDE_EMBED = 'https://drive.google.com/file/d/1-5xdVHlMEa8tSL1l9MczKwCs1LRIuC1l/preview';
const WHATSAPP_NUMBER = '0529934000';
const WHATSAPP_LINK = `https://wa.me/972${WHATSAPP_NUMBER.replace(/^0/, '')}`;
const CLICKEF_SITE = 'https://clickef.com/';
const CLICKEF_EMAIL = 'c3834000@gmail.com';
const activationPagePath = (page: number) => `/12346/${page}.jpg`;
const preparationPagePath = (page: number) => `/12345/${String(page + 2).padStart(2, '0')}.jpg`;
const EXCEL_BLANK_URL = 'https://docs.google.com/spreadsheets/d/17NuS-tKYoibJ0OoCRIfX2MjpEWZg_I1r/edit?gid=626162172#gid=626162172';
const EXCEL_QUESTIONS_URL = 'https://docs.google.com/spreadsheets/d/1MHrb6_9L_spKNP_BdxMcp-PRYL-h1a40/edit?usp=drive_link&ouid=114051899853305167738&rtpof=true&sd=true';
const handbookPagePath = (page: number) => `/1234/${String(page).padStart(2, '0')}.pdf`;

const FAQ_ITEMS = [
  { q: 'האם אפשר להכין לבד שאלות?', a: 'ודאי שאפשר, וזה אפילו מאוד מומלץ.' },
  { q: 'האם יש לכם מאגר שאלות?', a: 'כן! יש לנו מאגר של אלפי שאלות מחולקות לקטגוריות: ידע עולם, ידע כללי, יהדות, שאלות משפחתיות, שאלות לבת מצווה, מעגל השנה, זה"ב, משנה, חומש, גמרא ועוד ועוד.' },
  { q: 'האפשר להכניס תמונות וסרטונים?', a: 'לא רק שאפשר – זה מאוד מומלץ ומוסיף המון לחוויה.' },
  { q: 'האם צריך חיבור לרשת?', a: 'בחידון שמתבצע עם קליקרים אין צורך. בחידון שמתבצע עם טלפונים צריך חיבור לרשת.' },
  { q: 'מה אתם מקבלים?', a: 'קליקרים, רסיבר (מקלט) ותוכנה.' },
  { q: 'מה עוד צריך?', a: 'מסך, מקרן, רמקול – את זה תצטרכו לארגן לבד.' },
  { q: 'מאיפה אוספים את הקליקרים?', a: 'המשרד המרכזי שלנו נמצא בביתר עילית. יש לנו מוקדים בבית שמש, ירושלים, מודיעין עילית, בני ברק. לערים אחרות יש אפשרות למשלוח במחיר מסובסד.' },
];

const TOC_ITEMS: { label: string; page: number; icon: 'FileText' | 'BookOpen' | 'FileSpreadsheet' | 'Image' | 'List' | 'BarChart2' | 'PlayCircle' }[] = [
  { label: 'מילוי טופס הזמנת אירוע', page: 3, icon: 'FileText' },
  { label: 'הרשמה לאתר הכנת החידון', page: 4, icon: 'BookOpen' },
  { label: 'יצירת חידון חדש', page: 5, icon: 'BookOpen' },
  { label: 'מראה מסך דף הבית', page: 6, icon: 'List' },
  { label: 'סוגי מסכים', page: 7, icon: 'List' },
  { label: 'מסך שאלת טריוויה', page: 8, icon: 'FileText' },
  { label: 'הוספת שאלות מתוך המאגר', page: 9, icon: 'BookOpen' },
  { label: 'הוספת שאלות מקובץ אקסל', page: 10, icon: 'FileSpreadsheet' },
  { label: 'מסך שאלת סקר', page: 11, icon: 'BarChart2' },
  { label: 'מסך מה בתמונה', page: 12, icon: 'Image' },
  { label: 'מסך טקסט', page: 13, icon: 'FileText' },
  { label: 'מסך הגרלה', page: 14, icon: 'PlayCircle' },
  { label: 'מסך מדיה', page: 15, icon: 'PlayCircle' },
  { label: 'מסך דיון / הצבעה', page: 16, icon: 'BarChart2' },
  { label: 'הוספת קבוצות', page: 17, icon: 'List' },
  { label: 'מסך מובילים', page: 18, icon: 'BarChart2' },
  { label: 'מסך מנצחים', page: 19, icon: 'BarChart2' },
  { label: 'הורדת משחק', page: 20, icon: 'PlayCircle' },
];
const TOC_SHORT = [
  { label: 'הפעלת התוכנה', page: 1 },
  { label: 'חיבור רסיבר', page: 2 },
  { label: 'מסך מובילים', page: 18 },
  { label: 'הורדת משחק', page: 20 },
];

const ACTIVATION_TOC: { label: string; page: number }[] = [
  { label: 'הוראות כלליות ושאלות נפוצות', page: 1 },
  { label: 'הורדת קובץ המשחק', page: 2 },
  { label: 'חילוץ הקובץ - 1', page: 3 },
  { label: 'חילוץ הקובץ - 2', page: 4 },
  { label: 'הפעלת המשחק וחיבור הרסיבר', page: 5 },
  { label: 'התחברות למשחק רגיל', page: 6 },
  { label: 'התחברות למשחק טלפוני', page: 7 },
  { label: 'הפעלת המשחק טלפוני', page: 8 },
  { label: 'התחברות למשחק רגיל / טלפוני (דף 12)', page: 9 },
  { label: 'התחברות למשחק רגיל / טלפוני (דף 13)', page: 10 },
  { label: 'מקשי הפעלת המשחק', page: 12 },
  { label: 'התחברות למשחק רגיל / טלפוני ובדיקת שלטים (מסך ההצטרפות)', page: 13 },
  { label: 'Receiver Not Connected (פתרון בעיות)', page: 14 },
  { label: 'הגדרות המשחק', page: 15 },
  { label: 'הוספת קובץ שמות שחקנים', page: 16 },
  { label: 'הגדרת והפעלת קבוצות', page: 17 },
  { label: 'טיפים ורעיונות לשדרוג המשחק', page: 18 },
];

const PICKUP_LOCATIONS = [
  { city: 'ביתר עילית', lines: ['רח\' קדושת לוי 106/8', 'משפחת ארליך', '052-7656562'] },
  { city: 'בני ברק', lines: ['משרדי קול ברמה', 'רחוב אבן גבירול 16, קומה -2', 'טלפון: 050-4156790', 'פתוח בדרך כלל מ-9:00 עד 21:00', 'נא לוודא שיש שם ערכה זמינה'] },
  { city: 'ירושלים', lines: ['עלות משלוח 50 ש"ח שישולמו לנהג', 'מגדלי הבירה רח\' ירמיהו פינת רח\' הצבי', 'בדרך כלל יש עוד מיקומים', 'המיקום המדויק יתואם מראש יומיים לפני האירוע'] },
  { city: 'מודיעין עילית', lines: ['רח\' נתיבות המשפט 5', 'ניתן להגיע בין השעות 9–14:00', 'רצוי לוודא מראש 050-4646808', 'תשלום לשליח 30 ש"ח (נא להביא מדויק)'] },
  { city: 'אלעד', lines: ['עלות משלוח 50 ש"ח', 'כתובת וטלפון לאיסוף יתואמו כיומיים לפני האירוע'] },
  { city: 'בית שמש', lines: ['עלות משלוח 30 ש"ח', 'כתובת וטלפון לאיסוף יתואמו כיומיים לפני האירוע'] },
  { city: 'אשדוד', lines: ['עלות משלוח 50 ש"ח שישולמו לנהג', 'מס\' הטלפון של השליח: 053-3173031', 'משלוח עד פתח הבניין (ולא עד הדלת)'] },
  { city: 'קרית גת, נתיבות, אופקים והאיזור', lines: ['עלות משלוח 100 ש"ח שישולמו לנהג', 'מס\' הטלפון של השליח: 054-5419579', 'משלוח עד פתח הבניין (ולא עד הדלת)'] },
  { city: 'שאר מקומות ואיזורים', lines: ['בתיאום מול המשרד'] },
];

const ClientJourneyPortal: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { leads, customers, settings } = useApp();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const stepFromUrl = searchParams.get('step');
  const [currentStep, setCurrentStep] = useState(stepFromUrl ? parseInt(stepFromUrl) : 0);

  const displayName = useMemo(() => {
    const lead = leads.find(l => l.id === id);
    if (lead) return lead.name;
    const customer = customers.find(c => c.id === id);
    if (customer) return customer.name;
    return 'לקוח יקר';
  }, [id, leads, customers]);

  const steps = [
    { label: 'הזמנת אירוע', icon: CalendarCheck, color: 'from-blue-400 to-blue-600' },
    { label: 'הכנת חידון', icon: BookOpen, color: 'from-purple-400 to-purple-600' },
    { label: 'הפעלת הקליקרים באירוע', icon: PlayCircle, color: 'from-green-400 to-green-600' },
    { label: 'איסוף הקליקרים', icon: MapPin, color: 'from-orange-400 to-orange-600' },
  ];

  const videoUrl = settings.portalVideoUrl || PORTAL_VIDEO_URL;
  const [mascotVisible, setMascotVisible] = useState(false);

  React.useEffect(() => {
    setTimeout(() => setMascotVisible(true), 300);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dir-rtl font-sans pb-20 selection:bg-purple-100">
      <header className="bg-slate-900 text-white pt-12 pb-20 px-6 relative overflow-hidden">
        <div className="max-w-4xl mx-auto relative z-10">
          <h1 className="text-4xl font-black mb-4">שלום {displayName}! הפקת האירוע שלך מתחילה כאן</h1>
          <p className="text-slate-400">אנחנו איתך בכל שלב, מההזמנה ועד להצלחה בערב עצמו.</p>
        </div>
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] -ml-48 -mt-48"></div>
        {mascotVisible && (
          <div className="absolute bottom-4 right-8 animate-bounce-in">
            <img src="/קליקי.png" alt="קליקי" className="w-32 h-32 drop-shadow-2xl" style={{ mixBlendMode: 'multiply' }} />
          </div>
        )}
      </header>

      <div className="max-w-5xl mx-auto -mt-12 px-4 space-y-10 relative z-20">
        <div className="bg-gradient-to-br from-slate-50 to-purple-50 rounded-[2.5rem] shadow-2xl p-10 border-2 border-purple-100 overflow-x-auto">
          <h3 className="text-2xl font-black text-slate-800 text-center mb-8">🗺️ מסלול ההכנה שלכם</h3>
          <div className="flex justify-between items-center min-w-[700px] relative">
            {/* Connection lines */}
            <div className="absolute top-8 left-0 right-0 h-1 bg-gradient-to-l from-green-300 via-purple-300 to-blue-300 rounded-full -z-10" style={{ width: '90%', margin: '0 5%' }}></div>
            
            {steps.map((step, idx) => (
              <button key={idx} onClick={() => setCurrentStep(idx)} className={`flex flex-col items-center gap-4 transition-all relative z-10 ${currentStep === idx ? 'scale-110' : 'opacity-70 hover:opacity-100 hover:scale-105'}`}>
                <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl bg-gradient-to-br ${step.color} ${currentStep === idx ? 'ring-4 ring-offset-4 ring-purple-400 animate-pulse' : ''} text-white transition-all relative`}>
                  <div className="absolute -top-3 -right-3 w-9 h-9 bg-white rounded-full flex items-center justify-center text-base font-black text-slate-800 shadow-xl border-3 border-purple-200">{idx + 1}</div>
                  <step.icon size={32} strokeWidth={2.5} />
                  {idx < currentStep && (
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                      <span className="text-white text-xs font-black">✓</span>
                    </div>
                  )}
                </div>
                <span className={`text-sm font-black text-center leading-tight max-w-[120px] ${currentStep === idx ? 'text-slate-800' : 'text-slate-500'}`}>{step.label}</span>
              </button>
            ))}
          </div>
          <div className="h-3 bg-slate-100 mt-8 rounded-full relative overflow-hidden shadow-inner">
            <div className="absolute h-full bg-gradient-to-l from-green-500 via-purple-500 to-blue-500 rounded-full transition-all duration-700 shadow-lg" style={{ width: `${(currentStep / (steps.length - 1)) * 100}%`, right: 0 }}></div>
          </div>
          <p className="text-center text-xs text-slate-500 mt-4 font-bold">שלב {currentStep + 1} מתוך {steps.length}</p>
        </div>


        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {currentStep === 0 && (
            <div className="space-y-8">
              <div className="bg-white rounded-[2.5rem] p-10 border-4 border-purple-500 shadow-2xl">
                <div className="flex flex-col md:flex-row gap-8 items-center text-center md:text-right">
                  <div className="w-24 h-24 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center shrink-0">
                    <AlertTriangle size={48} />
                  </div>
                  <div className="flex-1 space-y-4">
                    <h3 className="text-3xl font-black text-slate-800">הדבר הכי חשוב והראשון!</h3>
                    <p className="text-slate-500 text-lg">כדי לשריין רשמית את האירוע ולהבטיח שהתאריך שלכם שמור אצלנו, עליכם למלא את טופס ההזמנה. הנתונים נשמרים במערכת.</p>
                    <Link to={`/book?leadId=${id}`} className="inline-flex items-center gap-2 bg-purple-600 text-white px-10 py-5 rounded-[1.5rem] font-black text-xl shadow-xl hover:bg-purple-500 transition-all">
                      למילוי טופס הזמנה עכשיו <span className="rotate-180">←</span>
                    </Link>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-[2.5rem] p-10 shadow-xl border border-slate-100">
                <h3 className="text-2xl font-black mb-6 flex items-center gap-3"><HelpCircle className="text-purple-500" size={28} /> שאלות נפוצות</h3>
                <div className="space-y-3">
                  {FAQ_ITEMS.map((item, idx) => (
                    <div key={idx} className="border border-slate-100 rounded-2xl overflow-hidden transition-all">
                      <button onClick={() => setOpenFaq(openFaq === idx ? null : idx)} className="w-full flex items-center justify-between p-5 text-right font-bold text-slate-700 hover:bg-slate-50">
                        <span>{item.q}</span>
                        {openFaq === idx ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {openFaq === idx && <div className="p-5 bg-slate-50 text-sm text-slate-600 leading-relaxed border-t">{item.a}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-[2.5rem] shadow-xl border-2 border-blue-200 flex flex-col">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="bg-blue-500 p-5 rounded-2xl text-white shadow-lg">
                      <BookOpen size={36} />
                    </div>
                    <h4 className="text-2xl font-black text-slate-800">איך מכינים חידון?</h4>
                  </div>
                  
                  <div className="bg-white rounded-2xl p-6 mb-6 shadow-md border border-blue-100">
                    <p className="text-sm text-slate-700 mb-4 font-bold leading-relaxed">בשביל להכין חידון עליכם להכנס לקישור הזה בו תוכלו להכין את החידון שלכם:</p>
                    <a href="https://app.funclickgames.com/account/?ps=clickkef" target="_blank" rel="noopener noreferrer" className="block bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 rounded-xl font-bold text-center shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center gap-2">
                      <ExternalLink size={20} />
                      כניסה לאתר ההכנה
                    </a>
                  </div>

                  <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-md">
                    <div className="flex items-start gap-3">
                      <div className="bg-amber-400 text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-lg shrink-0">!</div>
                      <div className="flex-1">
                        <p className="text-sm text-amber-900 font-bold leading-relaxed mb-2">שימו לב!</p>
                        <p className="text-xs text-amber-800 leading-relaxed">בפעם הראשונה עליכם לבצע <strong>הרשמה</strong> לאתר בכפתור הוורוד, ולא על "התחבר".</p>
                        <p className="text-xs text-amber-800 leading-relaxed mt-2">💡 יש גם אפשרות להתחבר דרך חשבון גוגל.</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border-t-4 border-pink-500 flex flex-col">
                  <div className="flex items-center gap-4 mb-6"><div className="bg-pink-50 p-4 rounded-2xl text-pink-600"><Download size={32} /></div><h4 className="text-xl font-black text-slate-800">חומרי עזר</h4></div>
                  <div className="space-y-6 flex-1">
                    {/* Icon 1: Instruction Booklet */}
                    <div className="border-2 border-blue-100 rounded-2xl p-5 hover:shadow-lg hover:border-blue-300 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="bg-blue-100 p-4 rounded-full text-blue-600 shrink-0">
                          <BookOpen size={28} />
                        </div>
                        <div className="flex-1">
                          <h5 className="text-base font-black text-slate-800 mb-2">📖 חוברת הדרכה</h5>
                          <p className="text-xs text-slate-600 leading-relaxed mb-3">בחוברת תמצאו הדרכה מפורטת איך מכינים חידון, בחוברת יש גם מענה לכל השאלות שלכם. אם לא מצאתם מענה הנכם מוזמנים ליצור קשר איתנו.</p>
                          <a href={GUIDE_PDF_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 hover:underline">
                            <Download size={14} /> הורדת החוברת
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Icon 2: Excel Download */}
                    <div className="border-2 border-green-100 rounded-2xl p-5 hover:shadow-lg hover:border-green-300 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="bg-green-100 p-4 rounded-full text-green-600 shrink-0">
                          <FileSpreadsheet size={28} />
                        </div>
                        <div className="flex-1">
                          <h5 className="text-base font-black text-slate-800 mb-2">📥 קישור להורדת קובץ אקסל בפורמט ייעודי</h5>
                          <p className="text-xs text-slate-600 leading-relaxed mb-2">בקישור זה תוכלו להוריד קובץ אקסל ייעודי שבו תוכלו להזין את השאלות שלכם ולהעלות בקלות לחידון שלכם.</p>
                          <div className="bg-amber-50 border-r-2 border-amber-400 rounded-lg p-2 mb-3">
                            <p className="text-[11px] text-amber-900 font-semibold">⚠️ שימו לב! עליכם לוודא שהורדתם את הקובץ. אין אפשרות להכין את זה בגוגל דרייב.</p>
                          </div>
                          <p className="text-[10px] text-slate-500 mb-3 italic">הוראות העלאת אקסל – עמוד 10 בחוברת ההדרכה</p>
                          <a href={EXCEL_BLANK_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-bold text-green-600 hover:underline">
                            <Download size={14} /> הורדת קובץ אקסל ייעודי
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Icon 3: Question Database */}
                    <div className="border-2 border-purple-100 rounded-2xl p-5 hover:shadow-lg hover:border-purple-300 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="bg-purple-100 p-4 rounded-full text-purple-600 shrink-0">
                          <List size={28} />
                        </div>
                        <div className="flex-1">
                          <h5 className="text-base font-black text-slate-800 mb-2">📚 מאגר שאלות</h5>
                          <p className="text-xs text-slate-600 leading-relaxed mb-2">מצורף מאגר שאלות בסיסי בקובץ אקסל. אם הנכם מעונינים להוסיף שאלות מתוך קובץ זה, עליכם להעתיק את השורות של השאלה + התשובות לתוך האקסל הייעודי.</p>
                          <div className="bg-blue-50 border-r-2 border-blue-400 rounded-lg p-2 mb-3">
                            <p className="text-[11px] text-blue-900 font-semibold">💡 שימו לב: אנו ממליצים להעזר באפשרות הוספת שאלות מתוך המאגר הקיים באתר. יש בו יותר שאלות והוספת השאלות מתבצעת בקלות ובמהירות.</p>
                          </div>
                          <p className="text-[10px] text-slate-500 mb-3 italic">הוראות הוספת שאלות מתוך המאגר – עמוד 7 בחוברת ההדרכה</p>
                          <a href={EXCEL_QUESTIONS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-bold text-purple-600 hover:underline">
                            <Download size={14} /> הורדת מאגר שאלות
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100">
                <h4 className="text-lg font-black text-slate-800 mb-4">חוברת ההדרכה – איך מכינים חידון</h4>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 bg-slate-50 rounded-2xl p-4 overflow-hidden">
                    <div className="overflow-y-auto max-h-[600px] space-y-4">
                      {TOC_ITEMS.map((item) => (
                        <img key={item.page} src={preparationPagePath(item.page)} alt={item.label} className="w-full rounded-lg shadow-md" />
                      ))}
                    </div>
                  </div>
                  <div className="lg:col-span-1">
                    <div className="bg-slate-50 rounded-2xl p-4 sticky top-4">
                      <h5 className="text-sm font-black text-slate-700 mb-3">תוכן עניינים</h5>
                      <div className="space-y-2 overflow-y-auto max-h-[560px]">
                        {TOC_ITEMS.map((item, idx) => {
                          const Icon = item.icon === 'FileText' ? FileText : item.icon === 'FileSpreadsheet' ? FileSpreadsheet : item.icon === 'Image' ? Image : item.icon === 'List' ? List : item.icon === 'BarChart2' ? BarChart2 : item.icon === 'PlayCircle' ? PlayCircle : BookOpen;
                          return (
                            <a key={idx} href={`#prep-page-${item.page}`} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white hover:bg-purple-50 border border-slate-100 text-right text-xs font-bold text-slate-700 transition-colors">
                              <Icon size={14} className="text-purple-500 shrink-0" />
                              <span className="flex-1">{item.label}</span>
                              <span className="text-slate-400 text-[10px]">עמ׳ {item.page}</span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-8">
              <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl p-10 text-white shadow-2xl text-center">
                <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-full flex items-center justify-center mx-auto mb-6">
                  <PlayCircle size={40} />
                </div>
                <h3 className="text-4xl font-black mb-4">🎉 סיימתם להכין את החידון שלכם!</h3>
                <h4 className="text-2xl font-bold opacity-90">מה הלאה?</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Option 1 */}
                <div className="bg-white rounded-3xl p-8 shadow-xl border-2 border-purple-200 hover:border-purple-400 hover:shadow-2xl transition-all">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-3xl shrink-0">🎮</div>
                    <div>
                      <div className="text-lg font-black text-slate-800">אירוע קליקרים או קליקאורים</div>
                      <div className="text-xs text-purple-600 font-bold">בהפעלת חברת קליכיף</div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed font-medium">סיימתם את החלק שלכם! מכאן והלאה אנחנו נמשיך את התהליך.</p>
                  <div className="mt-6 bg-green-50 border-r-4 border-green-400 rounded-xl p-4">
                    <p className="text-xs text-green-900 font-bold">✅ אין צורך בפעולה נוספת מצדכם</p>
                  </div>
                </div>

                {/* Option 2 */}
                <div className="bg-white rounded-3xl p-8 shadow-xl border-2 border-blue-200 hover:border-blue-400 hover:shadow-2xl transition-all">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-3xl shrink-0">🎯</div>
                    <div>
                      <div className="text-lg font-black text-slate-800">קליק פור יו</div>
                      <div className="text-xs text-blue-600 font-bold">אירוע קליקרים בהפעלה עצמית</div>
                    </div>
                  </div>
                  <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                    <p className="font-bold text-slate-800">📋 השלבים:</p>
                    <p><strong>1.</strong> עליכם לוודא את סידור התשלום</p>
                    <p><strong>2.</strong> ללחוץ על כפתור <strong>"שליחת בקשה להורדת משחק"</strong> באתר הכנת החידון</p>
                    <p><strong>3.</strong> אנו מקבלים את הבקשה שלכם, מאשרים את ההורדה, ואתם תקבלו למייל שלכם מייל עם קישור להורדת המשחק שלכם והוראות הפעלה.</p>
                  </div>
                </div>

                {/* Option 3 */}
                <div className="bg-white rounded-3xl p-8 shadow-xl border-2 border-amber-200 hover:border-amber-400 hover:shadow-2xl transition-all">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center text-3xl shrink-0">📞</div>
                    <div>
                      <div className="text-lg font-black text-slate-800">פון קליק</div>
                      <div className="text-xs text-amber-600 font-bold">חידון טלפוני</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-4 italic">שכל המשתתפים נמצאים באותו אולם</p>
                  <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                    <p className="font-bold text-slate-800">📋 השלבים:</p>
                    <p><strong>1.</strong> עליכם לוודא את סידור התשלום</p>
                    <p><strong>2.</strong> ללחוץ על כפתור <strong>"שליחת בקשה להורדת משחק טלפוני בלבד"</strong> באתר הכנת החידון. בחרו את מס׳ המשתתפים, סמנו את אופן התשלום כפי שסוכם איתנו ואשרו את שליחת הבקשה</p>
                    <p><strong>3.</strong> אנו מקבלים את הבקשה שלכם, מאשרים את ההורדה, ואתם תקבלו למייל שלכם מייל עם קישור להורדת המשחק שלכם והוראות הפעלה.</p>
                    <p><strong>4.</strong> מספר הטלפון והחדר שדרכו המשתתפים מתחברים יופיע על המסך עם הפעלת המשחק בפעם הראשונה</p>
                  </div>
                </div>

                {/* Option 4 */}
                <div className="bg-white rounded-3xl p-8 shadow-xl border-2 border-teal-200 hover:border-teal-400 hover:shadow-2xl transition-all">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center text-3xl shrink-0">🎥</div>
                    <div>
                      <div className="text-lg font-black text-slate-800">טוק קליק</div>
                      <div className="text-xs text-teal-600 font-bold">חדר ועידה בשידור חי עם חידון קליקרים</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-4 italic">המשתתפים מחוברים מהבית בשיחת טלפון</p>
                  <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                    <p className="font-bold text-slate-800">📋 השלבים:</p>
                    <p><strong>1.</strong> עליכם לוודא את סידור התשלום</p>
                    <p><strong>2.</strong> ללחוץ על כפתור <strong>"שליחת בקשה להורדת משחק טלפוני בלבד"</strong> באתר הכנת החידון. בחרו את מס׳ המשתתפים, סמנו את אופן התשלום כפי שסוכם איתנו ואשרו את שליחת הבקשה</p>
                    <p><strong>3.</strong> אנו מקבלים את הבקשה שלכם, מאשרים את ההורדה, ואתם תקבלו למייל שלכם מייל עם קישור להורדת המשחק שלכם והוראות הפעלה.</p>
                    <p><strong>4.</strong> מספר הטלפון והחדר שדרכו המשתתפים מתחברים יופיע על המסך עם הפעלת המשחק בפעם הראשונה. המנחה מפעיל את המשחק מהמחשב שלו ורואה את נתוני ההצבעה וכו׳</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-3xl p-8 text-white shadow-2xl text-center">
                <h4 className="text-2xl font-black mb-4">📚 רוצים עוד מידע?</h4>
                <p className="text-white/90 mb-6">להורדת חוברת הוראות הפעלת התוכנה:</p>
                <a href={ACTIVATION_GUIDE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 bg-white text-purple-600 px-8 py-4 rounded-2xl font-black hover:bg-purple-50 transition-all shadow-lg text-lg">
                  <FileText size={24} /> הורדת חוברת הפעלה
                </a>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100">
                <h4 className="text-lg font-black text-slate-800 mb-4">חוברת ההדרכה להפעלת התוכנה</h4>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 bg-slate-50 rounded-2xl p-4 overflow-hidden">
                    <div className="overflow-y-auto max-h-[600px] space-y-4">
                      {ACTIVATION_TOC.map((item) => (
                        <img key={item.page} src={activationPagePath(item.page)} alt={item.label} className="w-full rounded-lg shadow-md" />
                      ))}
                    </div>
                  </div>
                  <div className="lg:col-span-1">
                    <div className="bg-slate-50 rounded-2xl p-4 sticky top-4">
                      <h5 className="text-sm font-black text-slate-700 mb-3">ראשי פרקים</h5>
                      <div className="space-y-2 overflow-y-auto max-h-[560px]">
                        {ACTIVATION_TOC.map((item, idx) => (
                          <a key={idx} href={`#activation-page-${item.page}`} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-white hover:bg-green-50 border border-slate-100 text-right text-xs font-bold text-slate-700 transition-colors">
                            <span className="flex-1">{item.label}</span>
                            <span className="text-slate-400 text-[10px]">עמ׳ {item.page}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="bg-white rounded-[2.5rem] p-10 shadow-xl border">
              <h3 className="text-2xl font-black mb-8">איסוף הקליקרים – מיקומים</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {PICKUP_LOCATIONS.map((loc, idx) => (
                  <div key={idx} className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                    <h4 className="text-lg font-black text-purple-700 mb-3 flex items-center gap-2"><MapPin size={18} /> {loc.city}</h4>
                    <div className="space-y-2 text-sm text-slate-600">
                      {loc.lines.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="mt-16 pt-10 pb-8 border-t border-slate-200 space-y-10">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 text-slate-600">
            <span className="text-2xl font-black text-purple-600">קליכיף</span>
            <a href="tel:052-9934000" className="flex items-center gap-2 hover:text-purple-600 transition-colors">
              <Phone size={18} /> 052-9934000
            </a>
            <a href={CLICKEF_SITE} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-purple-600 transition-colors">
              <ExternalLink size={18} /> clickef.com
            </a>
            <a href={`mailto:${CLICKEF_EMAIL}`} className="flex items-center gap-2 hover:text-purple-600 transition-colors">
              <Mail size={18} /> {CLICKEF_EMAIL}
            </a>
          </div>
          <div className="bg-gradient-to-l from-purple-50 to-slate-50 rounded-[2rem] p-8 border border-slate-100 text-center">
            <p className="text-lg font-black text-slate-800 mb-4">צור קשר עם נציג תמיכה</p>
            <p className="text-slate-600 mb-6 text-sm">קליכיף – איתכם כל הדרך לניצחון</p>
            <div className="flex items-center justify-center gap-6">
              <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="w-14 h-14 rounded-2xl bg-[#25D366] text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform" title="וואטסאפ">
                <MessageCircle size={28} strokeWidth={2} />
              </a>
              <a href={`mailto:${CLICKEF_EMAIL}`} className="w-14 h-14 rounded-2xl bg-red-500 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform" title="שליחת מייל">
                <Mail size={28} strokeWidth={2} />
              </a>
              <a href={CLICKEF_SITE} target="_blank" rel="noopener noreferrer" className="w-14 h-14 rounded-2xl bg-slate-700 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform" title="תמיכה דרך האתר / גוגל צ'אט">
                <MessageCircle size={28} strokeWidth={2} />
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ClientJourneyPortal;
