// Loader: מפנה כל import של '@supabase/supabase-js' אל המוק המקומי.
const MOCK_URL = new URL('./mock-supabase.mjs', import.meta.url).href;

export function resolve(specifier, context, nextResolve) {
  if (specifier === '@supabase/supabase-js') {
    return { shortCircuit: true, url: MOCK_URL };
  }
  return nextResolve(specifier, context);
}
