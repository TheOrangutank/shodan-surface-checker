import "server-only";
import { createClient } from "@supabase/supabase-js";

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

const PLACEHOLDER_SUPABASE_URL = "https://your-project.supabase.co";
const PLACEHOLDER_SERVICE_ROLE_KEY = "your_service_role_key_here";

export function getDb() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    supabaseUrl === PLACEHOLDER_SUPABASE_URL ||
    serviceRoleKey === PLACEHOLDER_SERVICE_ROLE_KEY
  ) {
    throw new DatabaseConfigError(
      "Supabase is not configured. Copy .env.example to .env.local and set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
