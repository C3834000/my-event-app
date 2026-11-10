// TOTP (RFC 6238) — קוד 6 ספרות מאפליקציית אימות (Google Authenticator וכד׳)
import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(s) {
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function hotp(key, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

// מאפשר סטייה של חלון אחד (30 שניות) לכל כיוון
export function verifyTotp(secretB32, code, now = Date.now()) {
  if (!secretB32 || !/^\d{6}$/.test(String(code || ''))) return false;
  const key = base32Decode(secretB32);
  const step = Math.floor(now / 1000 / 30);
  for (const w of [-1, 0, 1]) {
    const expected = hotp(key, step + w);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(code)))) return true;
  }
  return false;
}

export function currentTotp(secretB32, now = Date.now()) {
  return hotp(base32Decode(secretB32), Math.floor(now / 1000 / 30));
}
