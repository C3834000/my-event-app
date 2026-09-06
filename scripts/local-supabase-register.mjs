// רישום hook שמחליף את @supabase/supabase-js בתחליף המקומי העמיד.
// הרצה: node --import ./scripts/local-supabase-register.mjs scripts/docs-test-server.mjs
import { register } from 'node:module';
register('./local-supabase-loader.mjs', import.meta.url);
