// קריאות לשרת. כל בקשה נושאת את כותרת ה-CSRF ונשארת באותו דומיין.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: { 'x-ll-csrf': '1', ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data && (data as { error?: string }).error) || 'שגיאה');
  return data as T;
}

export type LlEvent = {
  id: string;
  title: string;
  event_date: string | null;
  slug: string;
  registration_open: boolean;
  is_active: boolean;
  created_at: string;
};

export type Registration = { id: string; event_id: string; full_name: string; phone: string; source: string; created_at: string };

export type Question = {
  id: string;
  event_id: string;
  position: number;
  text: string;
  options: string[];
  correct: string | null;
  points: number;
  status: 'draft' | 'open' | 'closed';
  opened_at: string | null;
  closed_at: string | null;
};

export type Participant = {
  id: string;
  phone: string;
  name: string | null;
  registered: boolean;
  admin: boolean;
  mute: boolean;
  hand: boolean;
  survey: string | null;
  duration: number;
  score: number;
};

export type LeaderRow = { phone: string; name: string | null; score: number; correct: number; answered: number };

export type LiveState = {
  serverTime: string;
  event: { id: string; title: string; event_date: string | null } | null;
  room: { key: string | null; found: boolean; availableRooms: number };
  counts: { total: number; listeners: number; admins: number; unmuted: number; hands: number; registeredOnLine: number; registeredTotal: number };
  participants: Participant[];
  openQuestion: (Question & { distribution: Record<string, number>; totalAnswers: number }) | null;
  leaderboard: LeaderRow[];
};

export function maskPhone(p: string) {
  if (!p || p.length < 6) return p || 'חסוי';
  return `${p.slice(0, 3)}-•••-${p.slice(-4)}`;
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
