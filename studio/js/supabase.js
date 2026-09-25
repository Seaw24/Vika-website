import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Email and password only: no sign-in link ever lands in the URL.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
});
