# 📅 הגדרת סנכרון ליומן Google - מדריך מלא

## 🎯 מטרה:
כשלקוח ממלא טופס הזמנה, האירוע יתווסף **אוטומטית** ליומן Google של החברה (c3834000@gmail.com)

---

## ⚠️ למה זה לא עובד עכשיו:

**Google Calendar API דורש אישור ומפתחות מ-Google!**
זה לא משהו שאני יכול לעשות בקוד בלבד - **אתה צריך להגדיר את זה**.

---

## 🚀 אפשרות 1: Google Calendar API (מקצועי)

### שלב 1: יצירת פרויקט ב-Google Cloud (10 דקות)

1. **גש ל-Google Cloud Console:**
   https://console.cloud.google.com/

2. **צור פרויקט חדש:**
   - לחץ על "Select a project" למעלה
   - לחץ "NEW PROJECT"
   - שם: "Clickef CRM"
   - לחץ "CREATE"

3. **הפעל את Google Calendar API:**
   - בתפריט צד, לחץ "APIs & Services" → "Library"
   - חפש "Google Calendar API"
   - לחץ "ENABLE"

4. **צור Credentials:**
   - לחץ "APIs & Services" → "Credentials"
   - לחץ "CREATE CREDENTIALS" → "OAuth client ID"
   - אם מבקשים, הגדר "OAuth consent screen":
     - User Type: External
     - App name: Clickef CRM
     - User support email: c3834000@gmail.com
     - Developer contact: c3834000@gmail.com
     - לחץ "SAVE AND CONTINUE" עד הסוף
   - חזור ל-Credentials
   - לחץ "CREATE CREDENTIALS" → "OAuth client ID"
   - Application type: "Web application"
   - Name: "Clickef CRM Web"
   - Authorized redirect URIs: `http://localhost:3000/auth/callback`
   - לחץ "CREATE"

5. **העתק את המפתחות:**
   - תקבל "Client ID" ו-"Client Secret"
   - שמור אותם!

### שלב 2: הוסף למערכת

1. **פתח את `.env.local`:**
   ```env
   VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE
   VITE_GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
   VITE_GOOGLE_CALENDAR_ID=c3834000@gmail.com
   ```

2. **התקן את הספרייה:**
   ```bash
   npm install @googleapis/calendar
   ```

3. **הקוד כבר מוכן!** (אני אכין אותו עבורך)

---

## 🎯 אפשרות 2: Zapier/Make (קל יותר!)

### למה זה יותר קל?
- ✅ אין צורך בקוד
- ✅ הגדרה של 5 דקות
- ✅ עובד מיד
- ❌ עולה כסף (אבל יש תוכנית חינמית)

### איך להגדיר (5 דקות):

#### דרך Zapier:
1. **צור חשבון ב-Zapier:**
   https://zapier.com/

2. **צור Zap חדש:**
   - Trigger: "Webhooks by Zapier" → "Catch Hook"
   - העתק את ה-URL שתקבל

3. **הוסף ל-`.env.local`:**
   ```env
   VITE_ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/...
   ```

4. **הגדר Action:**
   - Action: "Google Calendar" → "Create Detailed Event"
   - חבר את חשבון Google (c3834000@gmail.com)
   - מפה את השדות:
     - Calendar: בחר את היומן שלך
     - Event Title: `{{title}}`
     - Start Date & Time: `{{date}} {{startTime}}`
     - End Date & Time: `{{date}} {{endTime}}`
     - Description: `{{notes}}`
     - Location: `{{location}}`

5. **בדוק שזה עובד:**
   - מלא טופס הזמנה
   - האירוע יופיע ביומן Google!

---

## 🔥 אפשרות 3: קישור ידני (זמני)

עד שתגדיר את האפשרויות למעלה, המייל כבר כולל **כפתור "הוסף ליומן Google"**!

הלקוח לוחץ על הכפתור והאירוע מתווסף ליומן שלו.
**אבל זה לא מוסיף ליומן שלך אוטומטי.**

---

## 💰 לגבי הכספים:

אני מבין שאתה רוצה פילוחים כמו ב-Monday. בואו נוסיף:

### מה יש עכשיו:
- ✅ גבייה פתוחה
- ✅ צפי הכנסות
- ✅ סה"כ הכנסות

### מה חסר (תגיד לי מה אתה רוצה):
- 📊 פילוח לפי חודש?
- 📊 פילוח לפי סוג אירוע?
- 📊 פילוח לפי תג?
- 📊 פילוח לפי אמצעי תשלום?
- 📊 גרפים?

**אני יכול להוסיף כל פילוח שתרצה!** רק תגיד לי בדיוק מה אתה רואה ב-Monday ורוצה כאן.

---

## 🎓 איך לעבוד איתי טוב יותר:

### ✅ מה עובד טוב:
1. **תיאור ברור של הבעיה** - "הכספים לא מסתכמים נכון"
2. **דוגמה ספציפית** - "יש 5,000 ₪ ששולמו אבל זה מראה 1,200 ₪"
3. **צילום מסך** - עוזר מאוד!
4. **השוואה למה שיש** - "ב-Monday יש פילוח לפי חודש, אני רוצה את זה"

### ❌ מה מקשה:
1. **"שוב ושוב אותם דברים"** - אם משהו לא עובד, תגיד לי **מה בדיוק** לא עובד
2. **"למה זה לא עובד"** - לפעמים צריך הגדרה חיצונית (כמו Google API)
3. **הנחה שהכל אוטומטי** - דברים כמו Google Calendar דורשים הגדרה ידנית

### 💡 טיפ:
**לפני שאתה אומר "זה לא עובד":**
1. רענן את הדפדפן (Ctrl + Shift + R)
2. בדוק את ה-Console (F12) לשגיאות
3. תגיד לי **בדיוק** מה אתה רואה לעומת מה שאתה מצפה

---

## 🚀 מה אני מציע עכשיו:

### שלב 1: תקן את הכספים (5 דקות)
**תגיד לי בדיוק איזה פילוחים אתה רוצה מ-Monday**

### שלב 2: הגדר Zapier (5 דקות)
**זה הכי קל וזה יעבוד מיד**

### שלב 3: נוסיף עוד תכונות
**מה עוד חסר לך מ-Monday?**

---

## 📞 אני כאן בשבילך!

אני רוצה שזה יעבוד לך מושלם. 
**תגיד לי בדיוק מה חסר ואני אעשה את זה!**

---

**בואו נתחיל עם Zapier - זה ייקח 5 דקות ויעבוד מיד!** 🚀
