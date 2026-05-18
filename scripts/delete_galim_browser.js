// =============================================================================
// מחיקת אירועי "גלים תיירות" מ-localStorage של הדפדפן (גרסה 2 - בטוחה)
// משאיר את 6 האירועים האחרונים שנוצרו - מוחק את כל השאר
// הגיבוי יורד כקובץ JSON למחשב (לא ב-localStorage כדי לא לפוצץ את המכסה)
//
// איך להריץ:
// 1. פתח את האפליקציה שלך בדפדפן (myecrm2026.netlify.app)
// 2. לחץ F12 לפתיחת DevTools
// 3. לחץ על Tab "Console"
// 4. העתק את כל הקובץ הזה והדבק בקונסול
// 5. לחץ Enter
// 6. הסקריפט יוריד קובץ גיבוי, ואז יבקש אישור למחיקה
// =============================================================================

(function deleteGalimEvents() {
  const STORAGE_KEY = 'ME_CFM_STORAGE_V12';
  const SEARCH_TERM = 'גלים תיירות';
  const KEEP_COUNT = 6;

  const rawData = localStorage.getItem(STORAGE_KEY);
  if (!rawData) {
    console.error('❌ לא נמצאו נתונים ב-localStorage!');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawData);
  } catch (e) {
    console.error('❌ שגיאה בפענוח הנתונים:', e);
    return;
  }

  const allEvents = parsed.events || [];
  const allCustomers = parsed.customers || [];
  console.log(`📊 סך הכל אירועים במערכת: ${allEvents.length}`);
  console.log(`📊 סך הכל לקוחות במערכת: ${allCustomers.length}`);

  const galimCustomerIds = new Set(
    allCustomers
      .filter(c => (c.name || '').includes(SEARCH_TERM))
      .map(c => c.id)
  );
  console.log(`👥 לקוחות "${SEARCH_TERM}" שנמצאו: ${galimCustomerIds.size}`);

  const galimEvents = allEvents.filter(e =>
    (e.title || '').includes(SEARCH_TERM) ||
    galimCustomerIds.has(e.customerId)
  );

  console.log(`\n🎯 נמצאו ${galimEvents.length} אירועים של "${SEARCH_TERM}"`);

  if (galimEvents.length === 0) {
    console.log('✅ אין אירועים למחיקה.');
    return;
  }

  const sorted = [...galimEvents].sort((a, b) => {
    const ta = parseInt(String(a.id || '').replace(/\D/g, ''), 10) || 0;
    const tb = parseInt(String(b.id || '').replace(/\D/g, ''), 10) || 0;
    if (ta !== tb) return tb - ta;
    return String(b.date || '').localeCompare(String(a.date || ''));
  });

  const toKeep = sorted.slice(0, KEEP_COUNT);
  const toDelete = sorted.slice(KEEP_COUNT);

  console.log(`\n✅ יישארו ${toKeep.length} אירועים (החדשים ביותר):`);
  console.table(toKeep.map(e => ({
    id: e.id,
    title: e.title,
    date: e.date,
    amount: e.amount
  })));

  console.log(`\n🗑️ יימחקו ${toDelete.length} אירועים.`);

  // === שלב 1: גיבוי מלא של כל הנתונים כקובץ JSON להורדה ===
  console.log('\n💾 מוריד גיבוי מלא כקובץ JSON...');
  try {
    const fullBackup = {
      timestamp: new Date().toISOString(),
      note: 'גיבוי מלא לפני מחיקת אירועי גלים תיירות',
      storageKey: STORAGE_KEY,
      summary: {
        totalEvents: allEvents.length,
        eventsToDelete: toDelete.length,
        eventsToKeep: toKeep.length,
        totalCustomers: allCustomers.length
      },
      fullData: parsed
    };
    const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BACKUP_before_galim_delete_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('✅ קובץ הגיבוי הורד למחשב! (בדוק בתיקיית ההורדות)');
  } catch (err) {
    console.error('❌ שגיאה ביצירת קובץ גיבוי:', err);
    alert('❌ לא הצלחתי להוריד גיבוי. עצירה לבטחון. שגיאה: ' + err.message);
    return;
  }

  // === שלב 2: גיבוי קטן ב-localStorage (רק רשימת ה-IDs שנמחקו, לצורך שחזור מהיר) ===
  const backupKey = `ME_CFM_GALIM_DELETED_IDS_${Date.now()}`;
  try {
    const idsBackup = {
      timestamp: new Date().toISOString(),
      deletedIds: toDelete.map(e => e.id),
      note: 'רק רשימת IDs - הנתונים המלאים בקובץ ה-JSON שהורד'
    };
    localStorage.setItem(backupKey, JSON.stringify(idsBackup));
    console.log(`💾 רשימת IDs נשמרה ב-localStorage: ${backupKey}`);
  } catch (err) {
    console.warn('⚠️ לא הצלחתי לשמור רשימת IDs ב-localStorage, אבל הקובץ JSON כבר ירד.');
  }

  // === שלב 3: אישור סופי ===
  const ok = confirm(
    `📦 קובץ גיבוי כבר הורד לתיקיית ההורדות שלך!\n\n` +
    `אתה עומד למחוק ${toDelete.length} אירועים של "${SEARCH_TERM}".\n` +
    `יישארו ${toKeep.length} אירועים החדשים ביותר.\n\n` +
    `מתוך סך הכל ${allEvents.length} אירועים במערכת,\n` +
    `יישארו ${allEvents.length - toDelete.length} אירועים אחרי המחיקה.\n\n` +
    `להמשיך במחיקה?`
  );

  if (!ok) {
    console.log('❌ בוטל ע"י המשתמש. הגיבוי נשאר בתיקיית ההורדות.');
    return;
  }

  // === שלב 4: מחיקה בפועל ===
  const deleteIds = new Set(toDelete.map(e => e.id));
  const newEvents = allEvents.filter(e => !deleteIds.has(e.id));

  parsed.events = newEvents;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch (err) {
    console.error('❌ שגיאה בשמירת הנתונים אחרי המחיקה:', err);
    alert('❌ שגיאה בשמירה. הנתונים לא נמחקו.');
    return;
  }

  console.log(`\n✅✅✅ נמחקו ${toDelete.length} אירועים בהצלחה! ✅✅✅`);
  console.log(`📊 אירועים כעת במערכת: ${newEvents.length}`);
  console.log(`\n🔄 רענן את הדף עכשיו (F5) כדי לראות את השינויים!`);
  console.log(`\n💡 אם משהו השתבש - שחזר מקובץ הגיבוי שירד:`);
  console.log(`   1. פתח את ההגדרות באפליקציה`);
  console.log(`   2. לחץ על "שחזר מקובץ" / "ייבא"`);
  console.log(`   3. בחר את הקובץ BACKUP_before_galim_delete_*.json`);

  alert(
    `✅ נמחקו ${toDelete.length} אירועים בהצלחה!\n\n` +
    `אירועים שנותרו במערכת: ${newEvents.length}\n\n` +
    `🔄 רענן את הדף (F5) כדי לראות את השינויים.`
  );
})();
