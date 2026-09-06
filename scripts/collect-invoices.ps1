# ============================================================================
# איסוף חשבוניות מהמחשב אל מאגר המסמכים במערכת החיה — הפעלה חוזרת בפקודה אחת.
# ----------------------------------------------------------------------------
# 1. סורק את המחשב מחדש (קריאה בלבד — לא מזיז/משנה/מוחק קבצים).
# 2. מייבא כל חשבונית/קבלה חדשה שזוהתה בוודאות כ-2025/2026, בסטטוס "לבדיקה".
# 3. התקדמות נשמרת — מסמכים שכבר יובאו לא יישלחו שוב (וגם השרת חוסם לפי hash).
# דרישות: הקובץ .env.documents-prod עם מפתח הגישה (נוצר אוטומטית, מחוץ ל-git).
# הרצה: powershell -File scripts/collect-invoices.ps1
# ============================================================================
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path 'node_modules/pdf-parse')) {
  Write-Host 'מתקין רכיב קריאת PDF (חד-פעמי)...' -ForegroundColor Cyan
  npm i --no-save pdf-parse@1.1.1 | Out-Null
}

Write-Host '1/2 סורק את המחשב (קריאה בלבד)...' -ForegroundColor Cyan
node scripts/scan-invoices.mjs

Write-Host '2/2 מייבא מסמכים חדשים למערכת החיה...' -ForegroundColor Cyan
node scripts/import-scanned.mjs all --target=prod

Write-Host 'סיום. המסמכים ממתינים לבדיקה במסך: https://myecrm2026.netlify.app/#/documents' -ForegroundColor Green
