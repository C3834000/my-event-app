// נרמול מספרי טלפון ישראליים לצורה אחידה: 05XXXXXXXX / 0XXXXXXXX
export function normalizePhone(raw) {
  if (raw == null) return '';
  let d = String(raw).replace(/\D+/g, '');
  if (d.startsWith('00972')) d = '0' + d.slice(5);
  else if (d.startsWith('972')) d = '0' + d.slice(3);
  if (d && !d.startsWith('0') && (d.length === 9 || d.length === 8)) d = '0' + d;
  return d;
}

export function isValidIsraeliPhone(p) {
  return /^0\d{8,9}$/.test(p);
}

// ימות המשיח עשויים לצרף שם (val_name) למספר המחייג — מחלצים רק את המספר
export function phoneFromCallerId(callerIdNum) {
  if (!callerIdNum) return '';
  const m = String(callerIdNum).match(/\+?\d[\d-]{6,}/);
  return normalizePhone(m ? m[0] : callerIdNum);
}

export function maskPhone(p) {
  if (!p || p.length < 4) return p || '';
  return p.slice(0, 3) + '•'.repeat(Math.max(0, p.length - 6)) + p.slice(-3);
}
