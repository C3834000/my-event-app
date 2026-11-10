import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, isValidIsraeliPhone, phoneFromCallerId } from '../netlify/lib/phone.mjs';
import { verifyTotp, currentTotp, base32Encode } from '../netlify/lib/totp.mjs';
import { hashPassword, verifyPassword } from '../netlify/lib/security.mjs';

test('phone normalization', () => {
  assert.equal(normalizePhone('+972-50-123-4567'), '0501234567');
  assert.equal(normalizePhone('00972501234567'), '0501234567');
  assert.equal(normalizePhone('050 123 4567'), '0501234567');
  assert.equal(normalizePhone('501234567'), '0501234567');
  assert.ok(isValidIsraeliPhone('0501234567'));
  assert.ok(isValidIsraeliPhone('021234567'));
  assert.ok(!isValidIsraeliPhone('12345'));
  assert.equal(phoneFromCallerId('0501234567 משה כהן'), '0501234567');
  assert.equal(phoneFromCallerId(''), '');
});

test('totp accepts current code, rejects wrong code', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.ok(verifyTotp(secret, currentTotp(secret)));
  assert.ok(!verifyTotp(secret, '000000') || currentTotp(secret) === '000000');
  assert.ok(!verifyTotp(secret, 'abc'));
  // RFC 6238 test vector (SHA1, T=59 → 94287082 → 6 ספרות אחרונות 287082)
  assert.ok(verifyTotp(secret, '287082', 59 * 1000));
});

test('password hashing', () => {
  const h = hashPassword('correct horse battery');
  assert.ok(verifyPassword('correct horse battery', h));
  assert.ok(!verifyPassword('wrong', h));
  assert.ok(!verifyPassword('x', 'garbage'));
});
