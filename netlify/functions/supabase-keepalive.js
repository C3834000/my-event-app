import { createClient } from '@supabase/supabase-js';

/**
 * נקרא אוטומטית ע"י Netlify Scheduled Functions (ראה netlify.toml).
 * שאילתה קצרה ל-Supabase כדי לשמר פעילות ולהפחית סיכוי להשהיית פרויקט Free.
 */
export default async (request) => {
  let nextRun = null;
  try {
    const body = await request.json();
    nextRun = body?.next_run;
  } catch {
    // קריאה ידנית מ-netlify dev וכו'
  }

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('[supabase-keepalive] missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    return new Response(JSON.stringify({ ok: false, error: 'env' }), { status: 503 });
  }

  const supabase = createClient(url, key);
  const { error } = await supabase.from('settings').select('id').limit(1).maybeSingle();

  if (error) {
    console.error('[supabase-keepalive]', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  console.log('[supabase-keepalive] ok', nextRun || '');
  return new Response(JSON.stringify({ ok: true, next_run: nextRun }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
