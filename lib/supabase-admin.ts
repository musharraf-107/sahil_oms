import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses Row Level Security. NEVER import this into
// any client component or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
// Only used in server-side API routes (app/api/**/route.ts).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
