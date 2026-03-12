/**
 * שירות גיבוי אוטומטי
 * מבצע גיבוי אוטומטי של הנתונים כל 24 שעות
 */

const STORAGE_KEY = 'ME_CFM_STORAGE_V12';
const BACKUP_KEY = 'ME_CFM_AUTO_BACKUP';
const BACKUP_TIMESTAMP_KEY = 'ME_CFM_LAST_BACKUP';
const BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 שעות

export interface BackupData {
  timestamp: string;
  data: string;
  version: string;
}

/**
 * יצירת גיבוי אוטומטי
 */
export function createAutoBackup(): boolean {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      console.warn('⚠️ אין נתונים לגיבוי');
      return false;
    }

    const backup: BackupData = {
      timestamp: new Date().toISOString(),
      data: data,
      version: 'V12'
    };

    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    localStorage.setItem(BACKUP_TIMESTAMP_KEY, backup.timestamp);
    
    console.log('✅ גיבוי אוטומטי נוצר בהצלחה:', backup.timestamp);
    return true;
  } catch (err) {
    console.error('❌ שגיאה ביצירת גיבוי אוטומטי:', err);
    return false;
  }
}

/**
 * שחזור מגיבוי אוטומטי
 */
export function restoreFromAutoBackup(): boolean {
  try {
    const backupStr = localStorage.getItem(BACKUP_KEY);
    if (!backupStr) {
      console.warn('⚠️ לא נמצא גיבוי אוטומטי');
      return false;
    }

    const backup: BackupData = JSON.parse(backupStr);
    localStorage.setItem(STORAGE_KEY, backup.data);
    
    console.log('✅ נתונים שוחזרו מגיבוי אוטומטי:', backup.timestamp);
    return true;
  } catch (err) {
    console.error('❌ שגיאה בשחזור מגיבוי אוטומטי:', err);
    return false;
  }
}

/**
 * בדיקה אם צריך לבצע גיבוי
 */
export function shouldBackup(): boolean {
  const lastBackup = localStorage.getItem(BACKUP_TIMESTAMP_KEY);
  if (!lastBackup) return true;

  const lastBackupTime = new Date(lastBackup).getTime();
  const now = Date.now();
  
  return (now - lastBackupTime) >= BACKUP_INTERVAL;
}

/**
 * קבלת מידע על הגיבוי האחרון
 */
export function getBackupInfo(): BackupData | null {
  try {
    const backupStr = localStorage.getItem(BACKUP_KEY);
    if (!backupStr) return null;
    return JSON.parse(backupStr);
  } catch (err) {
    console.error('❌ שגיאה בקריאת מידע גיבוי:', err);
    return null;
  }
}

/**
 * הורדת גיבוי כקובץ אוטומטית
 */
export function downloadBackupFile(): void {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      console.warn('⚠️ אין נתונים לגיבוי');
      return;
    }

    const parsed = JSON.parse(data);
    const backup = {
      timestamp: new Date().toISOString(),
      version: 'V12',
      data: parsed,
      summary: {
        events: parsed.events?.length || 0,
        customers: parsed.customers?.length || 0,
        leads: parsed.leads?.length || 0,
        tasks: parsed.tasks?.length || 0
      }
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `clickef-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('✅ קובץ גיבוי הורד:', backup.summary);
  } catch (err) {
    console.error('❌ שגיאה בהורדת גיבוי:', err);
  }
}

/**
 * הפעלת גיבוי אוטומטי מחזורי
 */
export function startAutoBackup(): void {
  // גיבוי ראשוני
  if (shouldBackup()) {
    createAutoBackup();
  }

  // גיבוי כל 24 שעות + הורדת קובץ
  setInterval(() => {
    if (shouldBackup()) {
      createAutoBackup();
      downloadBackupFile();
    }
  }, 60 * 60 * 1000); // בדיקה כל שעה

  // בדיקה יומית ב-23:00 להורדת גיבוי
  const checkDailyBackup = () => {
    const now = new Date();
    if (now.getHours() === 23 && now.getMinutes() === 0) {
      downloadBackupFile();
      console.log('💾 גיבוי יומי הורד אוטומטית');
    }
  };
  setInterval(checkDailyBackup, 60000);

  console.log('🔄 גיבוי אוטומטי הופעל - יוריד קובץ כל יום ב-23:00');
}

/**
 * ייצוא נתונים לקובץ
 */
export function exportToFile(): void {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      alert('❌ אין נתונים לייצוא');
      return;
    }

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clickef-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('✅ נתונים יוצאו לקובץ');
  } catch (err) {
    console.error('❌ שגיאה בייצוא:', err);
    alert('❌ שגיאה בייצוא נתונים');
  }
}

/**
 * בדיקת תקינות נתונים
 */
export function validateData(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      errors.push('אין נתונים ב-localStorage');
      return { valid: false, errors };
    }

    const parsed = JSON.parse(data);
    
    if (!Array.isArray(parsed.events)) {
      errors.push('שדה events לא תקין');
    }
    if (!Array.isArray(parsed.customers)) {
      errors.push('שדה customers לא תקין');
    }
    if (!Array.isArray(parsed.leads)) {
      errors.push('שדה leads לא תקין');
    }
    if (!Array.isArray(parsed.tasks)) {
      errors.push('שדה tasks לא תקין');
    }

    return { valid: errors.length === 0, errors };
  } catch (err) {
    errors.push('שגיאה בפענוח JSON: ' + (err as Error).message);
    return { valid: false, errors };
  }
}

// הוסף לחלון הגלובלי לשימוש בקונסול
if (typeof window !== 'undefined') {
  (window as any).autoBackup = {
    create: createAutoBackup,
    restore: restoreFromAutoBackup,
    export: exportToFile,
    download: downloadBackupFile,
    info: getBackupInfo,
    validate: validateData
  };
}
