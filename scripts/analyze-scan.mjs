// ניתוח ממצאי הסריקה: סיווג לשכבות ביטחון, פילוח לפי חודש, ובחירת חודש לייבוא.
// קריאה בלבד על findings.json. פלט: test-env/scan/analysis.md + import-plan.json
import fs from 'node:fs';

const F = JSON.parse(fs.readFileSync('test-env/scan/findings.json', 'utf8'));
const docs = F.documents;

const INVOICE_PATH_RE = /חשבונ|קבל|הוצא|invoice|receipt|תרומ/i;
const NOISE_NAME_RE = /^(whatsapp (image|video)|chatgpt image|generated image|gemini_generated|צילום מסך|screenshot|img[-_]\d)/i;

function tierOf(d) {
  if (d.isInvoiceLike === true) return 'A: אושר לפי תוכן';
  const inInvoiceFolder = d.locations.some(p => {
    const dir = p.slice(0, p.lastIndexOf('/'));
    return INVOICE_PATH_RE.test(dir);
  });
  if (d.ext === '.pdf' && inInvoiceFolder) return 'B: PDF בתיקיית חשבוניות (ללא טקסט/לא זוהה)';
  if (inInvoiceFolder && !NOISE_NAME_RE.test(d.fileName)) return 'C: תמונה/Office בתיקיית חשבוניות — לבדיקה';
  if (d.ext === '.pdf' && d.isInvoiceLike === false) return 'X: PDF שאינו חשבונית (לפי תוכן)';
  return 'X: רעש (שם עם שנה בלבד, ללא הקשר חשבוניות)';
}

const tiers = {};
for (const d of docs) {
  d.tier = tierOf(d);
  (tiers[d.tier] ||= []).push(d);
}

const out = [];
out.push('## שכבות סיווג');
for (const [t, arr] of Object.entries(tiers).sort()) out.push(`- ${t}: ${arr.length}`);

// פילוח חודשי לשכבה A לפי תאריך מהתוכן
out.push('\n## שכבה A לפי חודש (תאריך מתוך המסמך)');
const aByMonth = {};
for (const d of tiers['A: אושר לפי תוכן'] || []) {
  const k = d.dateStatus === 'clear' ? d.detectedDate.slice(0, 7) : 'תאריך-לא-ברור';
  (aByMonth[k] ||= []).push(d);
}
for (const [k, arr] of Object.entries(aByMonth).sort()) out.push(`- ${k}: ${arr.length}`);

// תיקיות מקור עיקריות (שכבות A+B+C)
out.push('\n## תיקיות מקור עיקריות (A+B+C)');
const dirCount = {};
for (const t of ['A: אושר לפי תוכן', 'B: PDF בתיקיית חשבוניות (ללא טקסט/לא זוהה)', 'C: תמונה/Office בתיקיית חשבוניות — לבדיקה']) {
  for (const d of tiers[t] || []) {
    for (const p of d.locations) {
      const dir = p.slice(0, p.lastIndexOf('/'));
      dirCount[dir] = (dirCount[dir] || 0) + 1;
    }
  }
}
for (const [dir, n] of Object.entries(dirCount).sort((a, b) => b[1] - a[1]).slice(0, 25)) out.push(`- ${n} · ${dir}`);

// בחירת חודש לייבוא: החודש עם הכי הרבה מסמכי A ב-2025/2026
const eligible = Object.entries(aByMonth).filter(([k]) => /^202[56]-/.test(k));
eligible.sort((a, b) => b[1].length - a[1].length);
const chosen = eligible[0];
out.push(`\n## חודש נבחר לייבוא: ${chosen ? chosen[0] : '—'} (${chosen ? chosen[1].length : 0} מסמכים בשכבה A)`);
if (chosen) {
  for (const d of chosen[1]) out.push(`- ${d.docType} · ${d.detectedDate} · ${d.fileName} · ${d.locations[0]}`);
  fs.writeFileSync('test-env/scan/import-plan.json', JSON.stringify({
    month: chosen[0],
    documents: chosen[1].map(d => ({
      hash: d.hash, fileName: d.fileName, docType: d.docType, docDate: d.detectedDate,
      docNumber: d.docNumber, locations: d.locations, review: d.review,
    })),
  }, null, 1), 'utf8');
}

fs.writeFileSync('test-env/scan/analysis.md', out.join('\n'), 'utf8');
console.log('נכתב test-env/scan/analysis.md + import-plan.json');
