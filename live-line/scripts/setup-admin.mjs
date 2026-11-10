// יוצר את הסודות להתחברות המנהל. מריצים פעם אחת במחשב שלכם:
//   node scripts/setup-admin.mjs
// ומעתיקים את הערכים שמודפסים אל משתני הסביבה ב-Netlify (Site settings → Environment variables).
import crypto from 'node:crypto';
import readline from 'node:readline';
import { hashPassword } from '../netlify/lib/security.mjs';
import { base32Encode } from '../netlify/lib/totp.mjs';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

const pw = await ask('בחרו סיסמת מנהל (לפחות 12 תווים): ');
rl.close();
if (pw.length < 12) {
  console.error('הסיסמה קצרה מדי. נדרשים לפחות 12 תווים.');
  process.exit(1);
}
const totpSecret = base32Encode(crypto.randomBytes(20));
const sessionSecret = crypto.randomBytes(48).toString('base64url');
const label = encodeURIComponent('Live Line');
console.log('\n===== העתיקו ל-Netlify → Environment variables =====');
console.log(`LL_ADMIN_PASSWORD_HASH=${hashPassword(pw)}`);
console.log(`LL_TOTP_SECRET=${totpSecret}`);
console.log(`LL_SESSION_SECRET=${sessionSecret}`);
console.log('LL_SESSION_VERSION=1');
console.log('\n===== אפליקציית אימות (Google Authenticator / Microsoft Authenticator) =====');
console.log('הוסיפו חשבון → "הזנת מפתח הגדרה" והקלידו את המפתח:');
console.log(totpSecret);
console.log('או קישור otpauth (לכלי QR):');
console.log(`otpauth://totp/${label}?secret=${totpSecret}&issuer=${label}&digits=6&period=30`);
console.log('\nאל תשמרו את הפלט הזה בקובץ ואל תשלחו אותו בהודעה.');
