// ============================================================================
// שירות לקוח למאגר המסמכים (שלב ראשון — העלאה ידנית).
// כל הקריאות עוברות דרך /api/documents עם מפתח גישה (x-docs-key) שהמשתמש
// מזין פעם אחת ונשמר מקומית. אין גישה ישירה ל-Supabase מהדפדפן.
// ============================================================================

export type DocDirection = 'income' | 'expense';
export type DocReviewStatus = 'needs_review' | 'confirmed';

export const DOC_TYPES = [
  'חשבונית מס',
  'קבלה',
  'חשבונית מס/קבלה',
  'חשבון עסקה',
  'זיכוי',
  'ביטול',
  'אחר',
] as const;

export interface FinanceDocument {
  id: string;
  direction: DocDirection;
  docType?: string | null;
  counterparty?: string | null;
  docNumber?: string | null;
  docDate?: string | null;
  currency?: string | null;
  netAmount?: number | null;
  vatAmount?: number | null;
  totalAmount?: number | null;
  notes?: string | null;
  reviewStatus: DocReviewStatus;
  relatedDocId?: string | null;
  transactionId?: string | null;
  giDocNumber?: string | null;
  filePath?: string | null;
  fileHash?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  fileSize?: number | null;
  createdAt?: string;
  updatedAt?: string;
  sources?: { sourceKind: string; sourceRef?: string | null; addedAt?: string }[];
  duplicateSuspect?: boolean;
}

export interface DocSuspect {
  id: string;
  docType?: string | null;
  counterparty?: string | null;
  docNumber?: string | null;
  docDate?: string | null;
  totalAmount?: number | null;
}

const DOCS_KEY_STORAGE = 'ME_CFM_DOCS_API_KEY';

export const getDocsApiKey = (): string => {
  try { return localStorage.getItem(DOCS_KEY_STORAGE) || ''; } catch { return ''; }
};

export const setDocsApiKey = (key: string) => {
  try { localStorage.setItem(DOCS_KEY_STORAGE, key.trim()); } catch { /* ignore */ }
};

async function post<T = any>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/documents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-docs-key': getDocsApiKey(),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    (err as Error & { duplicate?: boolean; existing?: unknown }).duplicate = !!data?.duplicate;
    (err as Error & { duplicate?: boolean; existing?: unknown }).existing = data?.existing;
    throw err;
  }
  return data as T;
}

/** SHA-256 של קובץ בדפדפן (WebCrypto) — הבסיס למניעת העלאה כפולה */
export async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface InitUploadResult {
  duplicate: boolean;
  existing?: FinanceDocument;
  path?: string;
  uploadUrl?: string;
}

export async function initUpload(file: File, fileHash: string): Promise<InitUploadResult> {
  return post({
    action: 'initUpload',
    fileHash,
    fileName: file.name,
    fileMime: file.type,
    fileSize: file.size,
  });
}

/** העלאת הקובץ עצמו ישירות ל-Storage דרך ה-URL החתום (עוקף מגבלת גודל של פונקציות) */
export async function uploadToSignedUrl(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) throw new Error(`העלאת הקובץ נכשלה (HTTP ${res.status})`);
}

export async function createDocument(
  data: Partial<FinanceDocument> & { direction: DocDirection },
  source?: { kind: string; ref?: string },
): Promise<{ document: FinanceDocument; suspects: DocSuspect[] }> {
  return post({ action: 'create', data, source });
}

export async function listDocuments(filters?: {
  direction?: DocDirection;
  reviewStatus?: DocReviewStatus;
  monthKey?: string;
}): Promise<FinanceDocument[]> {
  const res = await post<{ documents: FinanceDocument[] }>({ action: 'list', ...(filters || {}) });
  return res.documents || [];
}

export async function updateDocument(
  id: string,
  data: Partial<FinanceDocument>,
): Promise<{ document: FinanceDocument; suspects: DocSuspect[] }> {
  return post({ action: 'update', id, data });
}

export async function deleteDocument(id: string): Promise<void> {
  await post({ action: 'delete', id });
}

export async function getDocumentFileUrl(id: string): Promise<string> {
  const res = await post<{ url: string }>({ action: 'fileUrl', id });
  return res.url;
}
