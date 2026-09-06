// Loader: מפנה כל import של '@supabase/supabase-js' אל התחליף המקומי העמיד
// (test-env על הדיסק). לשימוש שרת הבדיקה בלבד.
const LOCAL_URL = new URL('./local-supabase.mjs', import.meta.url).href;

export function resolve(specifier, context, nextResolve) {
  if (specifier === '@supabase/supabase-js') {
    return { shortCircuit: true, url: LOCAL_URL };
  }
  return nextResolve(specifier, context);
}
