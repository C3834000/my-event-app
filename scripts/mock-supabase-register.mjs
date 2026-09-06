// רישום hook שמחליף את @supabase/supabase-js במוק — לבדיקות בלבד.
// הרצה: node --import ./scripts/mock-supabase-register.mjs scripts/test-documents-e2e.mjs
import { register } from 'node:module';
register('./mock-supabase-loader.mjs', import.meta.url);
