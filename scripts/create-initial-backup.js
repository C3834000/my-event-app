import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');

const eventsCSV = fs.readFileSync(path.join(projectRoot, 'נתוני אירועים 2.csv'), 'utf-8');
const customersCSV = fs.readFileSync(path.join(projectRoot, 'לקוחות.csv'), 'utf-8');
const tasksCSV = fs.readFileSync(path.join(projectRoot, 'משימות 2.csv'), 'utf-8');

function parseCSV(csv) {
  const lines = csv.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',');
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = values[idx]?.trim() || '';
    });
    rows.push(obj);
  }
  return rows;
}

const eventsData = parseCSV(eventsCSV);
const customersData = parseCSV(customersCSV);
const tasksData = parseCSV(tasksCSV);

const backup = {
  timestamp: new Date().toISOString(),
  version: 'V12',
  summary: {
    events: eventsData.length,
    customers: customersData.length,
    tasks: tasksData.length,
    leads: 0
  },
  data: {
    events: eventsData.map((e, idx) => ({
      id: `e_${Date.now() + idx}`,
      title: e.Name || 'אירוע',
      date: e['תאריך קיום האירוע'] || '',
      startTime: '10:00',
      endTime: '12:00',
      phone: e['מס\' טלפון: (המס\' שיהיה זמין בעת האירוע)'] || '',
      email: e['כתובת דוא"ל'] || '',
      location: e['כתובת האירוע'] || '',
      amount: Number(e['סכום סופי לתשלום']) || 0,
      paidAmount: e['סטטוס תשלום']?.includes('שולם') ? Number(e['סכום סופי לתשלום']) || 0 : 0,
      clickersNeeded: Number(e['כמות משתתפים משוערת']) || 0,
      eventType: e['סוג אירוע'] || 'תוכנית קליקרים',
      tag: e['תג אירוע'] || 'קליכיף',
      status: e.Status === 'בוצע ושולם' ? 'executed' : 'booked',
      paymentStatus: e['סטטוס תשלום'] || 'לא שולם',
      notes: e['הערות'] || '',
      hebrewDate: e['תאריך אירוע עברי'] || '',
      customerId: ''
    })),
    customers: customersData.map((c, idx) => ({
      id: `c_${Date.now() + idx}`,
      name: c.Name || '',
      phone: c['פלאפון'] || '',
      email: c['מייל'] || '',
      nextEvent: '',
      totalEvents: 0,
      totalRevenue: 0
    })),
    tasks: tasksData.map((t, idx) => ({
      id: `t_${Date.now() + idx}`,
      title: t['תיאור'] || '',
      category: t['קטגוריה'] || 'כללי',
      priority: Number(t['עדיפות']) || 3,
      isCompleted: t['סטטוס']?.includes('בוצע 100') || false,
      progress: t['סטטוס']?.includes('בוצע 25') ? 25 : t['סטטוס']?.includes('בוצע 50') ? 50 : t['סטטוס']?.includes('בוצע 75') ? 75 : t['סטטוס']?.includes('בוצע 100') ? 100 : 0,
      estimatedTimeMin: Number(t['משך זמן משוער בדקות']) || 0,
      dueDate: t['תאריך יעד'] || '',
      notes: '',
      customerId: '',
      eventId: ''
    })),
    leads: [],
    settings: {
      portalVideoUrl: 'https://drive.google.com/drive/home',
      companyName: 'קליכיף',
      contactPhone: '052-9934000'
    },
    customForms: []
  }
};

const outputPath = path.join(projectRoot, 'public', 'initial-backup.json');
fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2));

console.log('✅ קובץ גיבוי ראשוני נוצר!');
console.log('📊 סיכום:');
console.log('  📅 אירועים:', backup.summary.events);
console.log('  👥 לקוחות:', backup.summary.customers);
console.log('  ✅ משימות:', backup.summary.tasks);
console.log('📁 נשמר ב:', outputPath);
