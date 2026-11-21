import { createClient } from '@supabase/supabase-js';
// Publishable public key: security is enforced by authentication and database RLS.
export const supabase = createClient('https://ugtypmwxptmlqabgugxv.supabase.co', 'sb_publishable_YHe5AJBEFOMIu3_3dScEww_b4fjsaZ5', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
