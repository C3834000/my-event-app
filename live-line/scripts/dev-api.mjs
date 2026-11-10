// שרת API מקומי לפיתוח ובדיקות — מריץ את אותה פונקציית Netlify בדיוק,
// עם מסד נתונים בזיכרון וקו ימות המשיח מדומה.
//   npm run dev:api   (ובמקביל npm run dev)
import http from 'node:http';
import crypto from 'node:crypto';
import { hashPassword } from '../netlify/lib/security.mjs';
import { base32Encode, currentTotp } from '../netlify/lib/totp.mjs';

process.env.LL_DEV_MODE = '1';
process.env.LL_DEV_MEMORY = process.env.LL_DEV_MEMORY ?? '1';
process.env.LL_YEMOT_MOCK = process.env.LL_YEMOT_MOCK ?? '1';
process.env.YEMOT_CONF_ROOM = process.env.YEMOT_CONF_ROOM ?? '1';
const devPassword = process.env.LL_DEV_PASSWORD || 'dev-password-123';
process.env.LL_ADMIN_PASSWORD_HASH ||= hashPassword(devPassword);
process.env.LL_TOTP_SECRET ||= base32Encode(crypto.randomBytes(20));
process.env.LL_SESSION_SECRET ||= crypto.randomBytes(48).toString('base64url');

const { default: handler } = await import('../netlify/functions/api.mjs');

const port = Number(process.env.PORT || 8788);
http.createServer(async (req, res) => {
  if (req.url === '/__dev/totp') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(currentTotp(process.env.LL_TOTP_SECRET));
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  });
  const response = await handler(request, { ip: req.socket.remoteAddress });
  const headers = {};
  response.headers.forEach((v, k) => { headers[k] = v; });
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, '127.0.0.1', () => {
  console.log(`dev API on http://localhost:${port}`);
  console.log(`סיסמת פיתוח: ${devPassword}`);
  console.log(`מפתח TOTP לפיתוח: ${process.env.LL_TOTP_SECRET}  (קוד נוכחי: ${currentTotp(process.env.LL_TOTP_SECRET)})`);
  console.log(`לקוד עדכני: GET http://localhost:${port}/__dev/totp`);
});
